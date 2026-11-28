"""CTX-2: dependency-free Markdown link and flat skill metadata checks."""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit


def git(*args):
    return subprocess.check_output(['git', *args]).decode('utf-8')


def prose(text):
    # Fenced examples are data, not links/headings. Preserve line numbers.
    out, fence = [], None
    for line in text.splitlines():
        m = re.match(r'^\s*(`{3,}|~{3,})', line)
        if m:
            if fence is None:
                fence = m[1][0]
            elif m[1][0] == fence:
                fence = None
            out.append('')
        else:
            out.append(line if fence is None else '')
    return '\n'.join(out)


def anchors(text):
    result, counts = set(), {}
    for line in prose(text).splitlines():
        m = re.match(r'^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?$', line)
        if m:
            title = re.sub(r'\[([^]]+)\]\([^)]*\)', r'\1', m[1])
            slug = re.sub(r'[^\w\- ]', '', title.lower(), flags=re.UNICODE).replace(' ', '-')
            count = counts.get(slug, 0)
            result.add(slug + (f'-{count}' if count else ''))
            counts[slug] = count + 1
        result.update(re.findall(r'<(?:a|h[1-6])\s+[^>]*(?:id|name)=["\']([^"\']+)', line))
    return result


def links(text):
    clean = prose(text)
    # Reference definitions and inline links; balanced parentheses in destinations.
    refs = dict(re.findall(r'^\s*\[([^]]+)\]:\s*<?([^\s>]+)>?', clean, re.M))
    for line in clean.splitlines():
        line = re.sub(r'`+[^`]*`+', '', line)
        pattern = r'\[[^]\n]+\]\((<[^>]+>|(?:[^\s()]|\([^()]*\))+)(?:\s+["\'][^\n]*["\'])?\)'
        for match in re.finditer(pattern, line):
            yield match[1].strip('<>')
        for match in re.finditer(r'\[([^]]+)\]\[([^]]*)\]', line):
            key = match[2] or match[1]
            if key in refs:
                yield refs[key]


def target(source, url):
    parts = urlsplit(url)
    if parts.scheme or parts.netloc:
        return None  # External URLs are not fetched by CI.
    raw = unquote(parts.path)
    if '<' in raw or '>' in raw:
        return None  # Template placeholders.
    path = PurePosixPath(raw.lstrip('/')) if raw.startswith('/') else PurePosixPath(source).parent / raw
    if not raw:
        path = PurePosixPath(source)
    stack = []
    for part in path.parts:
        if part == '..':
            if not stack:
                return ('../outside-repo', unquote(parts.fragment))
            stack.pop()
        elif part != '.':
            stack.append(part)
    return ('/'.join(stack), unquote(parts.fragment))


def metadata(text):
    errors, values = [], {}
    if not text.startswith('---\n') or '\n---\n' not in text[4:]:
        return ['missing YAML frontmatter']
    for line in text[4:].split('\n---\n', 1)[0].splitlines():
        m = re.fullmatch(r'(name|description): (.+)', line)
        if not m or m[1] in values:
            errors.append('expected unique name/description flat YAML fields')
            continue
        value = m[2]
        if value.startswith('"'):
            try:
                value = json.loads(value)
            except ValueError:
                errors.append('invalid quoted YAML scalar')
                continue
        elif ': ' in value or ' #' in value or value[:1] in "[{&*!|>'%@`" or value.lower() in {'true', 'false', 'null', '~', 'yes', 'no', 'on', 'off'} or re.fullmatch(r'[+-]?[0-9.]+', value):
            errors.append('unsupported YAML scalar; use a JSON-quoted string')
            continue
        values[m[1]] = value
    if not isinstance(values.get('name'), str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', values.get('name', '')) or len(values.get('name', '')) > 64:
        errors.append('invalid skill name')
    if not isinstance(values.get('description'), str) or not values.get('description', '').strip() or len(values.get('description', '')) > 1024:
        errors.append('invalid skill description')
    return errors


def docs_only(paths):
    if not paths:
        return False
    for p in paths:
        if p == 'AGENTS.md':
            continue
        if p.startswith('docs/') and Path(p).suffix.lower() in {'.md', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.json', '.txt'}:
            continue
        if re.fullmatch(r'\.agents/skills/[^/]+/SKILL\.md', p) or p == '.agents/skills/README.md':
            continue
        # openai.yaml is checked by full CI; no blanket skills exemption.
        return False
    return True


class Snapshot:
    def __init__(self, ref=None):
        self.ref = ref
        self.files = set(git('ls-tree', '-r', '--name-only', ref).splitlines() if ref else git('ls-files').splitlines())
        if not ref:
            self.files |= set(git('ls-files', '--others', '--exclude-standard').splitlines())
            self.files = {p for p in self.files if Path(p).is_file()}
        self.cache = {}

    def read(self, path):
        if path not in self.cache:
            self.cache[path] = git('show', f'{self.ref}:{path}') if self.ref else Path(path).read_text()
        return self.cache[path]

    def exists(self, path):
        return path in self.files or any(p.startswith(path.rstrip('/') + '/') for p in self.files)


def diagnostics(snapshot, changed):
    errors = set()
    for source in sorted(p for p in snapshot.files if p.endswith('.md')):
        text = snapshot.read(source)
        if source.endswith('/SKILL.md') and source in changed:
            errors.update((source, 'metadata', error) for error in metadata(text))
        for url in links(text):
            dest = target(source, url)
            if dest is None or (source not in changed and dest[0] not in changed):
                continue
            path, anchor = dest
            if not snapshot.exists(path):
                errors.add((source, url, 'missing target'))
            elif anchor and path.endswith('.md') and path in snapshot.files and anchor not in anchors(snapshot.read(path)):
                errors.add((source, url, 'missing anchor'))
    return errors


def run(base):
    changed = set(git('diff', '--name-only', base, '--').splitlines())
    changed |= set(git('ls-files', '--others', '--exclude-standard').splitlines())
    old, current = Snapshot(base), Snapshot()
    before, after = diagnostics(old, changed), diagnostics(current, changed)
    for source, url, error in sorted(after - before):
        print(f'ERROR {source}: {error}: {url}')
    legacy = len(after & before)
    if legacy:
        print(f'WARNING: {legacy} unchanged legacy link issues; no new exemption recorded')
    entry = ['AGENTS.md', 'docs/context/README.md', 'docs/PROGRESS.md']
    old_size = sum(len(old.read(p)) for p in entry if p in old.files)
    size = sum(len(current.read(p)) for p in entry if p in current.files)
    print(f'Entry text: {old_size} -> {size} characters (not model tokens)')
    if size > 8000 or size > old_size * 1.1:
        print('::warning::Entry context grew or exceeds 8000 characters; review relevance, preserve required rules')
    print(f'Documentation check: {len(changed)} changed paths, {len(after - before)} new issues')
    return bool(after - before)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', required=True)
    parser.add_argument('--classify', action='store_true')
    args = parser.parse_args()
    if args.classify:
        paths = git('diff', '--name-only', args.base, '--').splitlines()
        print('false' if docs_only(paths) else 'true')
    else:
        sys.exit(run(args.base))
