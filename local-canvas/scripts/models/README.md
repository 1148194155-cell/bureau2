# Built-in Model

Place your GGUF model file here and rename it to `builtin.gguf`.

Recommended model: **Qwen2.5-3B-Instruct-Q4_K_M.gguf** (~1.8 GB)

## Steps

1. Download a GGUF model from HuggingFace (e.g. Qwen2.5-3B-Instruct)
2. Copy the file to this directory
3. Rename it to `builtin.gguf`
4. Restart the backend — the built-in model will be detected automatically

## Requirements

- Node.js >= 18
- The `node-llama-cpp` npm package is required (already added to `package.json`)
- No API keys or external services needed
