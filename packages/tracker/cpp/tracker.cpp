#include <napi.h>
#include <windows.h>
#include <tlhelp32.h>
#include <vector>
#include <string>
#include <cstdio>
#include <thread>
#include <mutex>


struct WindowInfo {
    HWND handle;
    std::string title;
    DWORD pid;
    DWORD parentPid;
};

// A struct to pass data from the native thread to the JS thread
struct WindowRect {
    int x;
    int y;
    int width;
    int height;
};

struct EventData {
    std::string type;
    WindowRect* payload = nullptr; // Only used for 'move' events
};

// A struct to hold all the data our hook thread will need
struct HookData {
    HWND target_hwnd = NULL;
    Napi::ThreadSafeFunction tsfnCallback;
};

// --- Global state to be shared between the main Node thread and our new worker thread ---
std::thread g_workerThread;
DWORD g_workerThreadId = 0;
HookData g_hookData;
std::mutex g_hookDataMutex; 

// This is the callback that JavaScript provides.
// It runs on the main Node.js thread.
Napi::Object CreateJsRectObject(Napi::Env env, int x, int y, int width, int height) {
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("x", Napi::Number::New(env, x));
    obj.Set("y", Napi::Number::New(env, y));
    obj.Set("width", Napi::Number::New(env, width));
    obj.Set("height", Napi::Number::New(env, height));
    return obj;
}

// --- Now, let's simplify the CallJs function using this helper ---
void CallJsWithEvent(Napi::Env env, Napi::Function jsCallback, EventData* data) {
    if (env != nullptr && jsCallback != nullptr && data != nullptr) {
        Napi::Object eventObject = Napi::Object::New(env);
        eventObject.Set("type", Napi::String::New(env, data->type));

        // If there is a payload (for 'move' events), add it to the object.
        if (data->type == "move") {
            WindowRect* rect = static_cast<WindowRect*>(data->payload);
            eventObject.Set("payload", CreateJsRectObject(env, rect->x, rect->y, rect->width, rect->height));
        }

        jsCallback.Call({ eventObject });
    }
    
    // Clean up the memory
    if (data != nullptr) {
        // Delete the payload based on its type
        if (data->type == "move") delete static_cast<WindowRect*>(data->payload);
        delete data; // Then delete the container
    }
}

// The WinEventProc callback itself remains mostly the same.
// It will be executed on our new worker thread.
VOID CALLBACK WinEventProc(HWINEVENTHOOK hWinEventHook, DWORD event, HWND hwnd, LONG idObject, LONG idChild, DWORD dwEventThread, DWORD dwmsEventTime) {
    std::lock_guard<std::mutex> guard(g_hookDataMutex);

    if (hwnd == g_hookData.target_hwnd) {
        if (event == EVENT_OBJECT_LOCATIONCHANGE) {
            RECT rect;
            GetWindowRect(hwnd, &rect);

            WindowRect* newRect = new WindowRect{
                rect.left, 
                rect.top, 
                rect.right - rect.left, 
                rect.bottom - rect.top,
            };

            g_hookData.tsfnCallback.BlockingCall(new EventData{"move", newRect}, CallJsWithEvent);
        } else if (event == EVENT_OBJECT_DESTROY) {
            printf("[C++ WinEventProc] Received DESTROY event for tracked window.\n");
            fflush(stdout);
            
            // Call the "onClosed" JavaScript callback. It doesn't need data.
            g_hookData.tsfnCallback.BlockingCall(new EventData{"close"}, CallJsWithEvent);
            
            // The window is gone, so our job is done.
            // Post a quit message to our own thread's message loop to shut down gracefully.
            PostThreadMessage(g_workerThreadId, WM_QUIT, 0, 0);
        }
    }
}

// This is the main function for our new background thread.
void HookThreadMain() {
    // This thread now owns the hook logic.
    g_workerThreadId = GetCurrentThreadId();
    g_hookDataMutex.lock();
    HWND target_hwnd = g_hookData.target_hwnd;
    g_hookDataMutex.unlock();

    // 2. Set the hook on this thread.
    HWINEVENTHOOK hook = SetWinEventHook(
        EVENT_OBJECT_DESTROY, EVENT_OBJECT_LOCATIONCHANGE,
        NULL,
        WinEventProc,
        GetProcessId(target_hwnd),
        GetWindowThreadProcessId(target_hwnd, NULL),
        WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS
    );

    if (hook == NULL) {
        printf("[C++ Thread] ERROR: SetWinEventHook failed in worker thread!\n");
        fflush(stdout);
        // --- FIX: Release both TSFNs on failure ---
        g_hookData.tsfnCallback.Release();
        return;
    }
    printf("[C++ Thread] Hook set successfully on dedicated thread.\n");
    fflush(stdout);

    // 3. This is the crucial part: A standard Windows Message Loop.
    // This provides the "mailbox" for the OS to deliver events to.
    MSG msg;
    while (GetMessage(&msg, NULL, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }
    
    // 4. The loop exits when we post a WM_QUIT message. Now, clean up.
    printf("[C++ Thread] Message loop exited. Unhooking...\n");
    fflush(stdout);
    UnhookWinEvent(hook);
    
    // 5. Release the reference to the thread-safe function.
    g_hookData.tsfnCallback.Release();
}

// --- Refactored Exported Functions ---

void StartTracking(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsFunction()) {
        Napi::TypeError::New(env, "Expected a handle (number) and a single callback function").ThrowAsJavaScriptException();
        return;
    }

    if (g_workerThread.joinable()) {
        Napi::Error::New(env, "Tracker is already running.").ThrowAsJavaScriptException();
        return;
    }

    int64_t handle_as_int = info[0].As<Napi::Number>().Int64Value();
    HWND hwnd = reinterpret_cast<HWND>(handle_as_int);
    Napi::Function jsCallback = info[1].As<Napi::Function>();

    if (!IsWindow(hwnd)) {
        Napi::Error::New(env, "The provided window handle is not valid.").ThrowAsJavaScriptException();
        return;
    }

    // --- NEW LOGIC: Get initial state and call back immediately ---
    printf("[C++ Main] Fetching initial window state...\n");
    fflush(stdout);
    
    // Now, prepare the data and launch the background thread to listen for FUTURE changes.
    std::lock_guard<std::mutex> guard(g_hookDataMutex);
    g_hookData.target_hwnd = hwnd;
    g_hookData.tsfnCallback = Napi::ThreadSafeFunction::New(env, jsCallback, "EventCallback", 0, 1);

    RECT initial_rect;
    GetWindowRect(hwnd, &initial_rect);
    WindowRect* rectPayload = new WindowRect{initial_rect.left, initial_rect.top, initial_rect.right - initial_rect.left, initial_rect.bottom - initial_rect.top};
    g_hookData.tsfnCallback.BlockingCall(new EventData{"move", rectPayload}, CallJsWithEvent);

    g_workerThread = std::thread(HookThreadMain);
}

void StopTracking(const Napi::CallbackInfo& info) {
    if (g_workerThread.joinable()) {
        // Post a WM_QUIT message to the worker thread's message queue to make GetMessage return 0.
        PostThreadMessage(g_workerThreadId, WM_QUIT, 0, 0);
        // Wait for the thread to finish its cleanup.
        g_workerThread.join();
        printf("[C++ Main] Worker thread joined successfully.\n");
        fflush(stdout);
    }
}

DWORD GetParentProcessId(DWORD processId) {
    DWORD parentPid = 0;
    HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);

    if (hSnapshot == INVALID_HANDLE_VALUE) {
        return 0;
    }

    PROCESSENTRY32 pe32;
    pe32.dwSize = sizeof(PROCESSENTRY32);

    if (Process32First(hSnapshot, &pe32)) {
        do {
            if (pe32.th32ProcessID == processId) {
                parentPid = pe32.th32ParentProcessID;
                break;
            }
        } while (Process32Next(hSnapshot, &pe32));
    }

    CloseHandle(hSnapshot);
    return parentPid;
}

BOOL CALLBACK EnumWindowsProc(HWND hwnd, LPARAM lParam) {
    auto& windows = *reinterpret_cast<std::vector<WindowInfo>*>(lParam);
    const int MAX_TITLE_LENGTH = 1024;
    char windowTitle[MAX_TITLE_LENGTH];
    GetWindowTextA(hwnd, windowTitle, MAX_TITLE_LENGTH);

    if (IsWindowVisible(hwnd) && GetWindowTextLength(hwnd) > 0 && !(GetWindowLong(hwnd, GWL_EXSTYLE) & WS_EX_TOOLWINDOW)) {
        // --- NEW LOGIC ---
        DWORD processId = 0;
        GetWindowThreadProcessId(hwnd, &processId);

        if (processId != 0) {
            DWORD parentProcessId = GetParentProcessId(processId);
            windows.push_back({hwnd, std::string(windowTitle), processId, parentProcessId});
        }
    }
    return TRUE;
}

// The new function we will export to JavaScript.
Napi::Value GetActiveWindows(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Create a vector to store the window information.
    std::vector<WindowInfo> windows;
    
    // Call EnumWindows, passing our vector as a parameter to the callback.
    EnumWindows(EnumWindowsProc, reinterpret_cast<LPARAM>(&windows));
    
    // Create a JavaScript array to return.
    Napi::Array result = Napi::Array::New(env, windows.size());
    
    // Iterate over our C++ vector and create JS objects for each window.
    for (size_t i = 0; i < windows.size(); ++i) {
        Napi::Object windowObject = Napi::Object::New(env);
        windowObject.Set("title", Napi::String::New(env, windows[i].title));
        windowObject.Set("handle", Napi::Number::New(env, reinterpret_cast<uintptr_t>(windows[i].handle)));
        // Add the new fields
        windowObject.Set("pid", Napi::Number::New(env, windows[i].pid));
        windowObject.Set("parentPid", Napi::Number::New(env, windows[i].parentPid));
        
        result[i] = windowObject;
    }
    return result;
}

Napi::Value TakeScreenshot(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected a window handle (number)").ThrowAsJavaScriptException();
        return env.Null();
    }

    int64_t handle_as_int = info[0].As<Napi::Number>().Int64Value();
    HWND hwnd = reinterpret_cast<HWND>(handle_as_int);

    if (!IsWindow(hwnd)) {
        Napi::Error::New(env, "The provided window handle is not valid.").ThrowAsJavaScriptException();
        return env.Null();
    }

    // 1. Get the window's device context (DC) and dimensions
    HDC hWindowDC = GetDC(hwnd);
    if (hWindowDC == NULL) {
        Napi::Error::New(env, "Failed to get window device context.").ThrowAsJavaScriptException();
        return env.Null();
    }
    RECT rect;
    GetClientRect(hwnd, &rect);
    int width = rect.right - rect.left;
    int height = rect.bottom - rect.top;

    // 2. Create an in-memory DC and bitmap (our "blank page")
    HDC hMemoryDC = CreateCompatibleDC(hWindowDC);
    HBITMAP hBitmap = CreateCompatibleBitmap(hWindowDC, width, height);
    SelectObject(hMemoryDC, hBitmap);

    // 3. Use PrintWindow to "photocopy" the window onto our bitmap
    PrintWindow(hwnd, hMemoryDC, PW_CLIENTONLY);

    // 4. Prepare to extract the raw pixel data from the bitmap
    BITMAPINFOHEADER bi;
    bi.biSize = sizeof(BITMAPINFOHEADER);
    bi.biWidth = width;
    bi.biHeight = -height; // Negative height to get a top-down bitmap
    bi.biPlanes = 1;
    bi.biBitCount = 32; // 32 bits per pixel (BGRA)
    bi.biCompression = BI_RGB;
    bi.biSizeImage = 0;
    bi.biXPelsPerMeter = 0;
    bi.biYPelsPerMeter = 0;
    bi.biClrUsed = 0;
    bi.biClrImportant = 0;

    // Allocate a buffer to hold the pixel data
    int bufferSize = width * height * 4;
    char* buffer = new char[bufferSize];

    // 5. Extract the pixel data
    GetDIBits(hMemoryDC, hBitmap, 0, height, buffer, (BITMAPINFO*)&bi, DIB_RGB_COLORS);

    // 6. IMPORTANT: Clean up all the GDI resources
    DeleteObject(hBitmap);
    DeleteDC(hMemoryDC);
    ReleaseDC(hwnd, hWindowDC);

    // 7. Create a Node.js Buffer from our C++ buffer.
    // We pass a finalizer callback to ensure our C++ buffer is deleted
    // when the Node.js Buffer is garbage collected.
    return Napi::Buffer<char>::New(env, buffer, bufferSize, [](Napi::Env, char* data) {
        delete[] data;
    });
}

Napi::Value SetWindowOwner(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "Expected a child handle (number) and an owner handle (number)").ThrowAsJavaScriptException();
        return env.Null();
    }

    int64_t child_handle_as_int = info[0].As<Napi::Number>().Int64Value();
    HWND childHwnd = reinterpret_cast<HWND>(child_handle_as_int);

    int64_t owner_handle_as_int = info[1].As<Napi::Number>().Int64Value();
    // A handle of 0 means we are removing the owner.
    HWND ownerHwnd = reinterpret_cast<HWND>(owner_handle_as_int);

    if (!IsWindow(childHwnd)) {
        Napi::Error::New(env, "The provided child window handle is not valid.").ThrowAsJavaScriptException();
        return env.Null();
    }
    // It's okay if the owner handle is 0, but if it's not 0, it must be a valid window.
    if (ownerHwnd != NULL && !IsWindow(ownerHwnd)) {
        Napi::Error::New(env, "The provided owner window handle is not valid.").ThrowAsJavaScriptException();
        return env.Null();
    }

    // GWLP_HWNDPARENT, when used on a top-level window (like our overlay), sets its OWNER.
    // This is the core of the magic.
    SetWindowLongPtr(childHwnd, GWLP_HWNDPARENT, (LONG_PTR)ownerHwnd);
    
    // This function returns the old value, but we don't need it.
    // We'll just return true to indicate success.
    return Napi::Boolean::New(env, true);
}


// This function initializes the addon and exports our functions.
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "startTracking"), Napi::Function::New(env, StartTracking));
    exports.Set(Napi::String::New(env, "stopTracking"), Napi::Function::New(env, StopTracking));
    exports.Set(Napi::String::New(env, "getActiveWindows"), Napi::Function::New(env, GetActiveWindows));
    exports.Set(Napi::String::New(env, "takeScreenshot"), Napi::Function::New(env, TakeScreenshot));
    exports.Set(Napi::String::New(env, "setWindowOwner"), Napi::Function::New(env, SetWindowOwner));
    return exports;
}

NODE_API_MODULE(tracker, Init)