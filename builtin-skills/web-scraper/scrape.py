#!/usr/bin/env python3
"""网页内容提取：抓取网页并提取正文文本"""
import sys, json, re

def scrape(url, fmt="text"):
    try:
        from urllib.request import urlopen, Request
    except ImportError:
        from urllib2 import urlopen, Request
    try:
        req = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; LocalCanvas/1.0)"})
        resp = urlopen(req, timeout=15)
        html = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        return {"error": f"请求失败: {str(e)}"}
    text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&[a-z]+;", " ", text)
    text = re.sub(r"\s{2,}", "\n", text).strip()
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE)
    title = title_match.group(1).strip() if title_match else url
    if fmt == "markdown":
        result = f"# {title}\n\n> 来源: {url}\n\n{text}"
    else:
        result = f"标题: {title}\n来源: {url}\n\n{text}"
    return {"success": True, "title": title, "url": url, "content": result, "length": len(text)}

if __name__ == "__main__":
    try:
        args = json.loads(sys.stdin.read())
    except:
        args = {"url": sys.argv[1]} if len(sys.argv) > 1 else {}
    result = scrape(args.get("url", ""), args.get("format", "text"))
    print(json.dumps(result, ensure_ascii=False))
