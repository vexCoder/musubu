declare global { namespace NodeJS { interface ProcessEnv { NODE_ENV: "development";
RENDERER_URL: "http://localhost:5173";
OVERLAY_URL: "http://localhost:5174"; } } } export {};