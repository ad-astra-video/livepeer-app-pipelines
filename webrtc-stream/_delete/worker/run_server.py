#!/usr/bin/env python3
"""
Simple script to run the WebRTC server
"""
import asyncio
import sys
from server import create_app
from aiohttp import web

async def main():
    print("Starting Python WebRTC Server...")
    print("Server will listen on http://0.0.0.0:8080")
    print("Endpoints:")
    print("  POST /start - Initiate WHIP/WHEP connections")
    print()
    
    try:
        app = await create_app()
        runner = web.AppRunner(app)
        await runner.setup()
        
        site = web.TCPSite(runner, '0.0.0.0', 8080)
        await site.start()
        
        print("Server started successfully!")
        print("Send POST request to /start to begin processing")
        
        # Keep the server running
        while True:
            await asyncio.sleep(1)
            
    except KeyboardInterrupt:
        print("\nShutting down server...")
    except Exception as e:
        print(f"Error starting server: {e}")
        sys.exit(1)

if __name__ == '__main__':
    asyncio.run(main())
