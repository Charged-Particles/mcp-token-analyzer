# Remote MCP Server for Alanyzing Tokens using CoinGecko Market Data

## Develop locally

```bash
nvm use
npm install
npm run build
```

## Connect Claude Desktop to your local MCP server

Follow [Anthropic's Quickstart](https://modelcontextprotocol.io/quickstart/user) and within Claude Desktop go to Settings > Developer > Edit Config to find your configuration file.

```bash
code /Users/[_you_username_here_]/Library/Application\ Support/Claude/claude_desktop_config.json
```

Open the file in your text editor and replace it with this configuration:

```json
{
  "mcpServers": {
    "token-analyzer": {
      "command": "/Users/[_you_username_here_]/.nvm/versions/node/v20.17.0/bin/node",
      "args": [
        "/Users/[_absolute_path_to_working_dir_here_]/build/index.js"
      ]
    }
  }
}
```
