"""CTX-2: validation boundary and link-regression tests; no external services."""
import importlib.util
import unittest
import sys
sys.dont_write_bytecode = True
from pathlib import Path

spec = importlib.util.spec_from_file_location('check_docs', Path(__file__).with_name('check-docs.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Memory:
    def __init__(self, files):
        self.content = files
        self.files = set(files)

    def read(self, path):
        return self.content[path]

    def exists(self, path):
        return path in self.files or any(p.startswith(path + '/') for p in self.files)


class DocsCheck(unittest.TestCase):
    def test_executable_and_config_files_never_docs_only(self):
        for path in ['scripts/check-docs.py', '.github/workflows/check.yml',
                     '.agents/skills/x/scripts/check.py', '.agents/skills/x/script.md',
                     '.agents/skills/x/agents/openai.yaml', 'docs/script.js', 'docs/run.sh', 'src/a.ts']:
            with self.subTest(path=path):
                self.assertFalse(m.docs_only(['AGENTS.md', path]))
        self.assertFalse(m.docs_only([]))

    def test_declarative_docs_scope(self):
        self.assertTrue(m.docs_only(['docs/a.md', 'docs/image.png', 'AGENTS.md', '.agents/skills/x/SKILL.md']))

    def test_heading_duplicates_unicode_and_code(self):
        text = '# Цена — `API`\n# Цена — `API`\n```md\n# Example\n```\n<a id="manual"></a>'
        self.assertEqual(m.anchors(text), {'цена--api', 'цена--api-1', 'manual'})

    def test_inline_reference_encoded_and_fenced_links(self):
        text = '[a](../b.md#%D1%86%D0%B5%D0%BD%D0%B0)\n[r][ref]\n[ref]: ../b.md\n`[ignore](absent)`\n```\n[x](absent)\n```'
        self.assertEqual(list(m.links(text)), ['../b.md#%D1%86%D0%B5%D0%BD%D0%B0', '../b.md'])
        self.assertEqual(m.target('docs/a.md', list(m.links(text))[0]), ('b.md', 'цена'))
        self.assertIsNone(m.target('docs/a.md', 'https://example.com/a'))
        self.assertEqual(m.target('docs/a.md', '#part'), ('docs/a.md', 'part'))

    def test_code_formatted_link_label_is_checked(self):
        files = Memory({'a.md': '[`go`](b.md#missing)', 'b.md': '# present'})
        self.assertEqual(m.diagnostics(files, {'a.md'}), {('a.md', 'b.md#missing', 'missing anchor')})

    def test_removed_anchor_checks_unchanged_incoming_link(self):
        old = Memory({'a.md': '[go](b.md#old)', 'b.md': '# old'})
        new = Memory({'a.md': '[go](b.md#old)', 'b.md': '# new'})
        self.assertFalse(m.diagnostics(old, {'b.md'}))
        self.assertEqual(m.diagnostics(new, {'b.md'}), {('a.md', 'b.md#old', 'missing anchor')})

    def test_removed_file_checks_incoming_link(self):
        files = Memory({'a.md': '[go](b.md)'})
        self.assertEqual(m.diagnostics(files, {'b.md'}), {('a.md', 'b.md', 'missing target')})

    def test_new_link_error_is_not_hidden_by_legacy_error(self):
        old = Memory({'a.md': '[old](missing.md)'})
        new = Memory({'a.md': '[old](missing.md) [new](new-missing.md)'})
        added = m.diagnostics(new, {'a.md'}) - m.diagnostics(old, {'a.md'})
        self.assertEqual(added, {('a.md', 'new-missing.md', 'missing target')})

    def test_valid_skill_and_rejected_yaml(self):
        self.assertFalse(m.metadata('---\nname: korzina-demo-recheck\ndescription: Проверка исправленного дефекта.\n---\n'))
        for text in ['name: x', '---\nname: Bad Name\ndescription: ok\n---\n',
                     '---\nname: x\nname: y\ndescription: ok\n---\n',
                     '---\nname: x\ndescription: bad: value\n---\n',
                     '---\nname: x\ndescription: &ref value\n---\n',
                     '---\nname: x\ndescription: false\n---\n']:
            with self.subTest(text=text):
                self.assertTrue(m.metadata(text))


if __name__ == '__main__':
    unittest.main()
