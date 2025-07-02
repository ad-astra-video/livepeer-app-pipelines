#!/usr/bin/env python3
"""
Test client to simulate WHIP/WHEP endpoints
"""
import asyncio
from aiohttp import web, ClientSession
import json

class TestClient:
    def __init__(self):
        self.app = web.Application()
        self.setup_routes()
    
    def setup_routes(self):
        """Setup test WHIP/WHEP endpoints"""
        self.app.router.add_post('/process/worker/whip', self.handle_whip)
        self.app.router.add_post('/process/worker/whep', self.handle_whep)
    
    async def handle_whip(self, request):
        """Handle WHIP request (receive transformed media)"""
        sdp_offer = await request.text()
        print("Received WHIP offer:")
        print(sdp_offer[:200] + "..." if len(sdp_offer) > 200 else sdp_offer)
        
        # Return a mock SDP answer
        mock_answer = """v=0
o=- 0 0 IN IP4 127.0.0.1
s=-
t=0 0
m=video 9 UDP/TLS/RTP/SAVPF 96
c=IN IP4 127.0.0.1
a=rtcp:9 IN IP4 127.0.0.1
a=ice-ufrag:test
a=ice-pwd:testpassword
a=fingerprint:sha-256 00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00
a=setup:active
a=rtpmap:96 VP8/90000
m=audio 9 UDP/TLS/RTP/SAVPF 97
c=IN IP4 127.0.0.1
a=rtcp:9 IN IP4 127.0.0.1
a=ice-ufrag:test
a=ice-pwd:testpassword
a=fingerprint:sha-256 00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00
a=setup:active
a=rtpmap:97 OPUS/48000/2"""
        
        return web.Response(text=mock_answer, content_type="application/sdp")
    
    async def handle_whep(self, request):
        """Handle WHEP request (send source media)"""
        sdp_offer = await request.text()
        print("Received WHEP offer:")
        print(sdp_offer[:200] + "..." if len(sdp_offer) > 200 else sdp_offer)
        
        # Return a mock SDP answer
        mock_answer = """v=0
o=- 0 0 IN IP4 127.0.0.1
s=-
t=0 0
m=video 9 UDP/TLS/RTP/SAVPF 96
c=IN IP4 127.0.0.1
a=rtcp:9 IN IP4 127.0.0.1
a=ice-ufrag:test
a=ice-pwd:testpassword
a=fingerprint:sha-256 00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00
a=setup:active
a=rtpmap:96 VP8/90000
a=sendonly
m=audio 9 UDP/TLS/RTP/SAVPF 97
c=IN IP4 127.0.0.1
a=rtcp:9 IN IP4 127.0.0.1
a=ice-ufrag:test
a=ice-pwd:testpassword
a=fingerprint:sha-256 00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00
a=setup:active
a=rtpmap:97 OPUS/48000/2
a=sendonly"""
        
        return web.Response(text=mock_answer, content_type="application/sdp")

async def test_server():
    """Test the main server"""
    print("Testing server...")
    
    async with ClientSession() as session:
        async with session.post('http://localhost:8080/start') as response:
            result = await response.json()
            print(f"Server response: {result}")

async def main():
    print("Starting test client on port 8081...")
    
    client = TestClient()
    runner = web.AppRunner(client.app)
    await runner.setup()
    
    site = web.TCPSite(runner, '0.0.0.0', 8081)
    await site.start()
    
    print("Test client started!")
    print("WHIP endpoint: http://localhost:8081/process/worker/whip")
    print("WHEP endpoint: http://localhost:8081/process/worker/whep")
    
    # Test the main server
    await asyncio.sleep(1)
    await test_server()
    
    # Keep running
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down test client...")

if __name__ == '__main__':
    asyncio.run(main())
