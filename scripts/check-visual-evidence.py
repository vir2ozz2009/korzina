"""Verify canvas/preview evidence for a UI pull request (Python standard library)."""
import json
import os
import re
import subprocess
import sys
from pathlib import PurePosixPath


def git(*args):
    return subprocess.check_output(["git", *args])


def paths(base, head):
    output = git("diff", "--no-renames", "--name-only", "-z", base, head)
    return set(output.decode().split("\0")) - {""}


def visible(path):
    if re.search(r"\.(test|spec|stories)\.", path):
        return False
    return (path.startswith(("src/", "public/")) or path == "index.html") and (
        path.endswith((".tsx", ".jsx", ".css", ".scss", ".html", ".svg", ".webp", ".png", ".jpg", ".woff2"))
        or re.search(r"^src/(ui/|app/templates/|features/[^/]+/ui/)", path)
    )


def require(value, message):
    if not value:
        raise ValueError(message)


def png(head, path):
    require(isinstance(path, str) and path.startswith("docs/progress/")
            and ".." not in PurePosixPath(path).parts and path.endswith(".png"),
            "Expected a repository PNG in docs/progress/: " + str(path))
    blob = git("show", head + ":" + path)
    require(blob.startswith(b"\x89PNG\r\n\x1a\n") and blob[12:16] == b"IHDR"
            and b"IDAT" in blob and b"IEND" in blob, "Invalid PNG: " + path)
    return blob


def main(base, head):
    base = git("merge-base", base, head).decode().strip()
    changed = paths(base, head)
    ui = {p for p in changed if visible(p)}
    if not ui:
        print("No changed UI paths.")
        return
    reports = [p for p in changed if re.fullmatch(r"docs/progress/visual/[\w.-]+\.json", p)
               and subprocess.run(["git", "cat-file", "-e", head + ":" + p]).returncode == 0]
    require(len(reports) == 1, "Add one visual evidence report. See docs/TESTING.md §7. Changed UI: "
            + ", ".join(sorted(ui)))
    report = json.loads(git("show", head + ":" + reports[0]))
    rendered = report["previewCommit"]
    require(re.fullmatch(r"[0-9a-f]{40}", rendered), "Expected full previewCommit SHA")
    require(subprocess.run(["git", "merge-base", "--is-ancestor", rendered, head]).returncode == 0,
            "Preview commit must belong to the PR history")
    require(not any(visible(p) for p in paths(rendered, head)), "UI changed since screenshots")
    require(re.fullmatch(r"https://designs\.magicpath\.ai/[^\s]+[?&]revisionId=\d+[^\s]*",
                         report["canvas"]), "Pin the approved canvas revision")
    covered = set()
    for pair in report["pairs"]:
        require(pair["screen"].strip() and pair["state"].strip() and pair["review"].strip(),
                "Each pair needs a screen, state and visual review")
        require(pair["width"] in (360, 390, 412), "Expected CSS viewport width")
        require(pair["preview"] in changed, "Add or update the preview PNG for this PR")
        require(png(head, pair["reference"]) != png(head, pair["preview"]),
                "Reference and preview are the same image")
        require(isinstance(pair["files"], list) and pair["files"], "List the covered UI files")
        if pair["width"] == 390:
            covered.update(pair["files"])
    require(not ui - covered, "Missing 390 px coverage: " + ", ".join(sorted(ui - covered)))
    print(f"Verified {len(report['pairs'])} image pairs for {len(ui)} UI paths.")


if __name__ == "__main__":
    try:
        main(os.environ["PR_BASE_SHA"], os.environ["PR_HEAD_SHA"])
    except (ValueError, KeyError, TypeError, AttributeError, subprocess.CalledProcessError) as error:
        sys.exit(f"Visual evidence: {error}")
