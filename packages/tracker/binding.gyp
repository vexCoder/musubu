{
  "targets": [
    {
      "target_name": "tracker",
      "sources": [ "cpp/tracker.cpp" ],
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include_dir\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      # --- Add these flags to ensure modern C++ support ---
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "10.7"
      },
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "AdditionalOptions": [ "/std:c++17" ] # Use C++17 standard
        }
      },
      # --- Windows Specific Settings ---
      "conditions": [
        ['OS=="win"', {
          "libraries": [
            "-luser32.lib"
          ]
        }]
      ]
    }
  ]
}