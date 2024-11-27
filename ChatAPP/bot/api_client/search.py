from typing import Optional
import json
import requests

class Search:
    def __init__(self, api_key: str, num: int, country: str, location: str, language: str, content_type: str = 'application/json', url: Optional[str] = None):
        if url is not None:
            self.url = url
        else:
            self.url = "https://google.serper.dev/search"
        self.num = num
        self.api_key = api_key
        self.country = country
        self.location = location
        self.language = language
        self.content_type = content_type

    def __call__(self, query):
        payload = json.dumps({
            'q' : query,
            'location' : self.location,
            'gl' : self.country,
            'hl' : self.language,
            'num' : self.num,
        })
        headers = {
            'X-API-KEY': self.api_key,
            'Content-Type': self.content_type
        }
        response = requests.request("POST", self.url, headers=headers, data=payload)
        return response