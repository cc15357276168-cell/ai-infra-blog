from __future__ import annotations

import math
import re
import shutil
import subprocess
import tempfile
import threading
import zipfile
from datetime import date
from pathlib import Path
from tkinter import END, filedialog, messagebox
import tkinter as tk
from urllib.parse import unquote, urlparse


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"}
IMAGE_RE = re.compile(r"!\[([^\]]*)\]\((?:<([^>]+)>|([^ )]+))(?:\s+[^)]*)?\)")


def safe_name(value: str, fallback: str = "post") -> str:
    value = re.sub(r"[<>:\"/\\|?*\x00-\x1f]", "-", value).strip(" .")
    value = re.sub(r"\s+", "-", value)
    return value[:80] or fallback


def unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    for index in range(2, 1000):
        candidate = path.with_name(f"{path.stem}-{index}{path.suffix}")
        if not candidate.exists():
            return candidate
    raise RuntimeError(f"Too many duplicate files: {path.name}")


def safe_extract(archive: zipfile.ZipFile, destination: Path) -> None:
    root = destination.resolve()
    for member in archive.infolist():
        target = (destination / member.filename).resolve()
        if target != root and root not in target.parents:
            raise RuntimeError(f"Unsafe ZIP path: {member.filename}")
    archive.extractall(destination)


def find_asset(md_file: Path, raw_link: str, files: list[Path]) -> Path | None:
    link = unquote(raw_link.strip().strip("<>"))
    if link.startswith(("http://", "https://", "data:")):
        return None
    link = urlparse(link).path.replace("/", "\\")
    candidate = (md_file.parent / link).resolve()
    if candidate.is_file():
        return candidate
    filename = Path(link).name.lower()
    matches = [file for file in files if file.name.lower() == filename]
    return matches[0] if len(matches) == 1 else None


def frontmatter(title: str, excerpt: str, words: int) -> str:
    minutes = max(1, math.ceil(words / 220))
    return (
        "---\n"
        f"title: {title}\n"
        f"date: {date.today().isoformat()}\n"
        "category: Notes\n"
        "tags: Notion\n"
        f"minutes: {minutes} min\n"
        f"excerpt: {excerpt}\n"
        "---\n\n"
    )


def convert_markdown(md_file: Path, extracted_files: list[Path], posts_dir: Path, images_dir: Path) -> tuple[Path, int]:
    source = md_file.read_text(encoding="utf-8-sig", errors="replace")
    title_match = re.search(r"^#\s+(.+?)\s*$", source, re.MULTILINE)
    title = (title_match.group(1).strip() if title_match else md_file.stem).replace("\n", " ")
    title = re.sub(r"[*_`]+", "", title)
    paragraphs = [line.strip() for line in source.splitlines() if line.strip() and not line.lstrip().startswith("#")]
    excerpt = re.sub(r"[*_`>#\[\]]", "", paragraphs[0] if paragraphs else "A note imported from Notion.")[:180]
    body = source.strip()
    copied_images = 0
    image_folder = images_dir / safe_name(title)

    def replace_image(match: re.Match[str]) -> str:
        nonlocal copied_images
        alt, angle_link, plain_link = match.groups()
        raw_link = angle_link or plain_link or ""
        asset = find_asset(md_file, raw_link, extracted_files)
        if not asset or asset.suffix.lower() not in IMAGE_EXTENSIONS:
            return match.group(0)
        image_folder.mkdir(parents=True, exist_ok=True)
        target = unique_path(image_folder / safe_name(asset.name, "image"))
        shutil.copy2(asset, target)
        copied_images += 1
        relative = f"/images/{safe_name(title)}/{target.name}"
        return f"![{alt}]({relative})"

    body = IMAGE_RE.sub(replace_image, body)
    target = unique_path(posts_dir / f"{safe_name(title, md_file.stem)}.md")
    target.write_text(frontmatter(title, excerpt, len(re.findall(r"\w+", body))) + body + "\n", encoding="utf-8")
    return target, copied_images


class NotionPublisher(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Notion → ChenChen-blog")
        self.geometry("760x560")
        self.minsize(680, 500)
        self.project_dir = Path(__file__).resolve().parent.parent
        self.zip_path: Path | None = None
        self._build_ui()

    def _build_ui(self) -> None:
        self.columnconfigure(1, weight=1)
        self.rowconfigure(5, weight=1)
        tk.Label(self, text="Notion → ChenChen-blog", font=("Segoe UI", 18, "bold")).grid(row=0, column=0, columnspan=3, padx=24, pady=(22, 4), sticky="w")
        tk.Label(self, text="Import a Notion ZIP, organize images, and publish with one click.", fg="#5b6570").grid(row=1, column=0, columnspan=3, padx=24, pady=(0, 18), sticky="w")

        tk.Label(self, text="Blog folder").grid(row=2, column=0, padx=(24, 8), pady=8, sticky="w")
        self.project_var = tk.StringVar(value=str(self.project_dir))
        tk.Entry(self, textvariable=self.project_var).grid(row=2, column=1, padx=8, pady=8, sticky="ew")
        tk.Button(self, text="Browse…", command=self.choose_project).grid(row=2, column=2, padx=(8, 24), pady=8)

        tk.Label(self, text="Notion ZIP").grid(row=3, column=0, padx=(24, 8), pady=8, sticky="w")
        self.zip_var = tk.StringVar(value="No ZIP selected")
        tk.Entry(self, textvariable=self.zip_var, state="readonly").grid(row=3, column=1, padx=8, pady=8, sticky="ew")
        tk.Button(self, text="Choose ZIP…", command=self.choose_zip).grid(row=3, column=2, padx=(8, 24), pady=8)

        self.commit_var = tk.StringVar(value="Import Notion article")
        tk.Label(self, text="Commit message").grid(row=4, column=0, padx=(24, 8), pady=8, sticky="w")
        tk.Entry(self, textvariable=self.commit_var).grid(row=4, column=1, padx=8, pady=8, sticky="ew")

        self.log = tk.Text(self, height=16, state="disabled", wrap="word", bg="#f6f8fa")
        self.log.grid(row=5, column=0, columnspan=3, padx=24, pady=(12, 12), sticky="nsew")
        actions = tk.Frame(self)
        actions.grid(row=6, column=0, columnspan=3, padx=24, pady=(0, 22), sticky="e")
        self.import_button = tk.Button(actions, text="1. Import ZIP", width=16, command=self.import_zip)
        self.import_button.pack(side="left", padx=5)
        self.publish_button = tk.Button(actions, text="2. Publish to GitHub", width=20, command=self.publish, state="disabled")
        self.publish_button.pack(side="left", padx=5)

    def write_log(self, message: str) -> None:
        self.log.configure(state="normal")
        self.log.insert(END, message + "\n")
        self.log.see(END)
        self.log.configure(state="disabled")

    def choose_project(self) -> None:
        selected = filedialog.askdirectory(title="Choose your blog folder")
        if selected:
            self.project_var.set(selected)

    def choose_zip(self) -> None:
        selected = filedialog.askopenfilename(title="Choose Notion export ZIP", filetypes=[("ZIP archive", "*.zip"), ("All files", "*.*")])
        if selected:
            self.zip_path = Path(selected)
            self.zip_var.set(str(self.zip_path))
            self.write_log(f"Selected: {self.zip_path.name}")

    def import_zip(self) -> None:
        if not self.zip_path:
            messagebox.showwarning("Choose a ZIP", "Please choose a Notion export ZIP first.")
            return
        project = Path(self.project_var.get())
        posts_dir = project / "src" / "content" / "posts"
        images_dir = project / "public" / "images"
        posts_dir.mkdir(parents=True, exist_ok=True)
        images_dir.mkdir(parents=True, exist_ok=True)
        self.import_button.configure(state="disabled")
        try:
            with tempfile.TemporaryDirectory(prefix="notion-import-") as temp:
                extracted = Path(temp)
                with zipfile.ZipFile(self.zip_path) as archive:
                    safe_extract(archive, extracted)
                markdown_files = list(extracted.rglob("*.md"))
                if not markdown_files:
                    raise RuntimeError("No Markdown files were found in this ZIP.")
                all_files = [file for file in extracted.rglob("*") if file.is_file()]
                imported = 0
                copied = 0
                for md_file in markdown_files:
                    target, image_count = convert_markdown(md_file, all_files, posts_dir, images_dir)
                    self.write_log(f"Imported: {target.name} ({image_count} image(s))")
                    imported += 1
                    copied += image_count
            self.write_log(f"Done: {imported} article(s), {copied} image(s).")
            self.publish_button.configure(state="normal")
            messagebox.showinfo("Import complete", f"Imported {imported} article(s) and {copied} image(s).")
        except Exception as exc:
            self.write_log(f"ERROR: {exc}")
            messagebox.showerror("Import failed", str(exc))
        finally:
            self.import_button.configure(state="normal")

    def publish(self) -> None:
        project = Path(self.project_var.get())
        message = self.commit_var.get().strip() or "Import Notion article"
        self.publish_button.configure(state="disabled")
        threading.Thread(target=self._publish_worker, args=(project, message), daemon=True).start()

    def _publish_worker(self, project: Path, message: str) -> None:
        try:
            def run(args: list[str]) -> str:
                result = subprocess.run(["git", "-C", str(project), *args], capture_output=True, text=True, encoding="utf-8", errors="replace")
                output = (result.stdout + result.stderr).strip()
                if output:
                    self.after(0, self.write_log, output)
                if result.returncode:
                    raise RuntimeError(output or f"Git command failed: {' '.join(args)}")
                return output

            run(["add", "."])
            check = subprocess.run(["git", "-C", str(project), "diff", "--cached", "--quiet"])
            if check.returncode == 0:
                self.after(0, self.write_log, "Nothing new to commit.")
                return
            run(["commit", "-m", message])
            run(["push"])
            self.after(0, self.write_log, "Published successfully. Cloudflare Pages will deploy automatically.")
            self.after(0, lambda: messagebox.showinfo("Published", "GitHub push completed. Cloudflare Pages will deploy automatically."))
        except Exception as exc:
            self.after(0, self.write_log, f"PUBLISH ERROR: {exc}")
            self.after(0, lambda: messagebox.showerror("Publish failed", str(exc)))
        finally:
            self.after(0, lambda: self.publish_button.configure(state="normal"))


if __name__ == "__main__":
    NotionPublisher().mainloop()
