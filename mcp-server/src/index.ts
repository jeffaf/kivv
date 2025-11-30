/**
 * kivv MCP Server
 * Main entry point for the Cloudflare Worker handling MCP protocol
 */

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // MCP protocol handler will be implemented here
    return new Response('kivv MCP Server - Coming Soon', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};
