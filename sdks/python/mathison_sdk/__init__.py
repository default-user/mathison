"""
Mathison Python SDK
Client for Mathison API
"""

from typing import Optional, List, Dict, Any
import requests
from dataclasses import dataclass


@dataclass
class ChatMessage:
    id: str
    role: str
    content: str
    timestamp: int
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class SendMessageResponse:
    message: ChatMessage
    stream_id: Optional[str] = None


@dataclass
class ChatHistoryResponse:
    messages: List[ChatMessage]
    total: int
    limit: int
    offset: int


@dataclass
class Beam:
    beam_id: str
    kind: str
    title: str
    tags: List[str]
    body: str
    status: str
    pinned: bool
    updated_at_ms: int


@dataclass
class BeamQueryResponse:
    beams: List[Beam]
    total: int


class MathisonClient:
    """Client for interacting with Mathison API"""

    def __init__(
        self,
        base_url: str = "http://localhost:3000",
        api_key: Optional[str] = None,
        timeout: int = 30,
    ):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.timeout = timeout
        self.session = requests.Session()

        if api_key:
            self.session.headers['Authorization'] = f'Bearer {api_key}'

        self.session.headers['Content-Type'] = 'application/json'

    def _request(
        self,
        method: str,
        path: str,
        json: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Make an HTTP request to the API"""
        url = f"{self.base_url}{path}"

        # Filter out None values from params
        if params:
            params = {k: v for k, v in params.items() if v is not None}

        try:
            response = self.session.request(
                method=method,
                url=url,
                json=json,
                params=params,
                timeout=self.timeout,
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"API request failed: {e}")

    # ========== Health & Status ==========

    def health(self) -> Dict[str, str]:
        """Check API health"""
        return self._request('GET', '/health')

    def get_status(self) -> Dict[str, Any]:
        """Get system status"""
        return self._request('GET', '/api/status')

    def get_identity(self) -> Dict[str, Any]:
        """Get identity information"""
        return self._request('GET', '/api/identity')

    # ========== Chat ==========

    def send_message(self, content: str) -> SendMessageResponse:
        """Send a chat message"""
        data = self._request('POST', '/api/chat/send', json={'content': content})
        msg_data = data['message']
        message = ChatMessage(
            id=msg_data['id'],
            role=msg_data['role'],
            content=msg_data['content'],
            timestamp=msg_data['timestamp'],
            metadata=msg_data.get('metadata'),
        )
        return SendMessageResponse(
            message=message,
            stream_id=data.get('stream_id'),
        )

    def get_chat_history(
        self,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> ChatHistoryResponse:
        """Get chat history"""
        data = self._request(
            'GET',
            '/api/chat/history',
            params={'limit': limit, 'offset': offset},
        )
        messages = [
            ChatMessage(
                id=msg['id'],
                role=msg['role'],
                content=msg['content'],
                timestamp=msg['timestamp'],
                metadata=msg.get('metadata'),
            )
            for msg in data['messages']
        ]
        return ChatHistoryResponse(
            messages=messages,
            total=data['total'],
            limit=data['limit'],
            offset=data['offset'],
        )

    # ========== Beams ==========

    def query_beams(
        self,
        text: Optional[str] = None,
        tags: Optional[List[str]] = None,
        kinds: Optional[List[str]] = None,
        include_dead: Optional[bool] = None,
        limit: Optional[int] = None,
    ) -> BeamQueryResponse:
        """Query beams"""
        params = {
            'text': text,
            'tags': tags,
            'kinds': kinds,
            'include_dead': include_dead,
            'limit': limit,
        }
        data = self._request('GET', '/api/beams', params=params)
        beams = [
            Beam(
                beam_id=b['beam_id'],
                kind=b['kind'],
                title=b['title'],
                tags=b['tags'],
                body=b['body'],
                status=b['status'],
                pinned=b['pinned'],
                updated_at_ms=b['updated_at_ms'],
            )
            for b in data['beams']
        ]
        return BeamQueryResponse(beams=beams, total=data['total'])

    def get_beam(self, beam_id: str) -> Beam:
        """Get a specific beam"""
        data = self._request('GET', f'/api/beams/{beam_id}')
        return Beam(
            beam_id=data['beam_id'],
            kind=data['kind'],
            title=data['title'],
            tags=data['tags'],
            body=data['body'],
            status=data['status'],
            pinned=data['pinned'],
            updated_at_ms=data['updated_at_ms'],
        )

    def create_beam(
        self,
        kind: str,
        title: str,
        tags: List[str],
        body: str,
        beam_id: Optional[str] = None,
        pinned: Optional[bool] = None,
    ) -> Beam:
        """Create a new beam"""
        payload = {
            'kind': kind,
            'title': title,
            'tags': tags,
            'body': body,
        }
        if beam_id:
            payload['beam_id'] = beam_id
        if pinned is not None:
            payload['pinned'] = pinned

        data = self._request('POST', '/api/beams', json=payload)
        return Beam(
            beam_id=data['beam_id'],
            kind=data['kind'],
            title=data['title'],
            tags=data['tags'],
            body=data['body'],
            status=data['status'],
            pinned=data['pinned'],
            updated_at_ms=data['updated_at_ms'],
        )

    def update_beam(
        self,
        beam_id: str,
        title: Optional[str] = None,
        tags: Optional[List[str]] = None,
        body: Optional[str] = None,
    ) -> Beam:
        """Update a beam"""
        payload = {}
        if title:
            payload['title'] = title
        if tags:
            payload['tags'] = tags
        if body:
            payload['body'] = body

        data = self._request('PATCH', f'/api/beams/{beam_id}', json=payload)
        return Beam(
            beam_id=data['beam_id'],
            kind=data['kind'],
            title=data['title'],
            tags=data['tags'],
            body=data['body'],
            status=data['status'],
            pinned=data['pinned'],
            updated_at_ms=data['updated_at_ms'],
        )

    def pin_beam(self, beam_id: str) -> Dict[str, bool]:
        """Pin a beam"""
        return self._request('POST', f'/api/beams/{beam_id}/pin')

    def unpin_beam(self, beam_id: str) -> Dict[str, bool]:
        """Unpin a beam"""
        return self._request('DELETE', f'/api/beams/{beam_id}/pin')

    def retire_beam(self, beam_id: str) -> Dict[str, bool]:
        """Retire a beam"""
        return self._request('POST', f'/api/beams/{beam_id}/retire')

    def tombstone_beam(
        self,
        beam_id: str,
        reason_code: str,
        approval_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Tombstone a beam"""
        payload = {'reason_code': reason_code}
        if approval_token:
            payload['approval_token'] = approval_token
        return self._request('POST', f'/api/beams/{beam_id}/tombstone', json=payload)


__all__ = [
    "MathisonClient",
    "ChatMessage",
    "SendMessageResponse",
    "ChatHistoryResponse",
    "Beam",
    "BeamQueryResponse",
]
