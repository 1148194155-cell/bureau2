# Lightweight sandbox image for executing user code nodes.
# Node 20 Alpine — minimal attack surface, no build tools, no shell extras.
FROM node:20-alpine

# Create a restricted non-root user
RUN adduser -D -s /bin/false sandbox

# Set up a clean workspace owned by sandbox
WORKDIR /workspace
RUN chown sandbox:sandbox /workspace

# Drop to non-root user
USER sandbox

# The code to execute is mounted at /workspace/code.js at runtime.
# Input data is passed via /workspace/input.json.
# The runner reads input.json, requires code.js, calls the default export
# function with the parsed input, and writes output to /workspace/output.json.

COPY runner.js /runner.js

ENTRYPOINT ["node", "/runner.js"]
