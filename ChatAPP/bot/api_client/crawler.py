import asyncio
from typing import Optional, List
from bs4 import BeautifulSoup
from urllib.parse import urlparse
import ssl
import aiohttp

class Crawler:
    def __init__(self, allowed_domains: Optional[List[str]] = None):
        self.allowed_domains = allowed_domains
        self.ssl_context = ssl.create_default_context()
        self.ssl_context.check_hostname = False
        self.ssl_context.verify_mode = ssl.CERT_NONE

    async def fetch_with_retry(self, session, url, retries=3):
        for attempt in range(retries):
            try:
                async with session.get(url, headers={'User-Agent': 'Mozilla/5.0'}, ssl=self.ssl_context) as response:
                    if response.status == 200:
                        return await response.text()
                    elif response.status in [429, 403]:
                        wait_time = 2 ** attempt
                        print(f"Received status code {response.status}, retrying in {wait_time} seconds.")
                        await asyncio.sleep(wait_time)
                    else:
                        print(f"Error fetching {url}, status code: {response.status}")
                        return None
            except Exception as e:
                print(f"Error fetching {url}: {e}")
                return None
        return None

    def clean_html(self, html_content: str) -> str:
        # Parse the HTML content
        soup = BeautifulSoup(html_content, 'html.parser')

        # Remove <script>, <header>, <style> tags and their content
        for tag in soup(['script', 'header', 'style']):
            tag.decompose()

        # Get text and remove extra whitespace
        text = soup.get_text(separator=' ', strip=True)

        # Optional: Remove any remaining HTML tags (shouldn't be any)
        clean_text = BeautifulSoup(text, 'html.parser').get_text()

        return clean_text

    async def __call__(self, links: List[str], session: aiohttp.ClientSession):
        web_contents = []
        for i in range(0, len(links), 10):
            batch_links = links[i:i+10]
            tasks = []
            link_tasks = []
            for link in batch_links:
                parsed_url = urlparse(link)
                link_domain = parsed_url.netloc
                if link_domain.startswith('www.'):
                    link_domain = link_domain[4:]
                if self.allowed_domains is None or link_domain in self.allowed_domains:
                    # Skip LinkedIn links
                    if 'linkedin.com' in link_domain:
                        print(f"Skipping LinkedIn URL: {link}")
                        continue
                    task = asyncio.create_task(self.fetch_with_retry(session, link))
                    tasks.append(task)
                    link_tasks.append(link)
            if tasks:
                results = await asyncio.gather(*tasks)
                for link, content in zip(link_tasks, results):
                    if content:
                        # Clean the HTML content
                        clean_content = self.clean_html(content)
                        web_contents.append({'url': link, 'content': clean_content})
            # Sleep for 1 second between batches
            await asyncio.sleep(1)
        return web_contents