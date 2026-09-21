#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把扫描版 PDF 的指定页渲染成图片，供「读图录入」（教材生词表 / 课文）使用。

为什么要固化成一个脚本：
  教材录入是跨多次会话的大工程，之前把渲染脚本放在系统 temp 里，
  temp 被清理后脚本连同参数一起丢了（测试脚本 v4–v9 就这样丢过）。
  渲染参数（宽度、scale、输出目录）是可复用的知识，必须进仓库。

用法
  python tools/render-pdf.py <PDF路径> <输出目录> <页码...>
  python tools/render-pdf.py book.pdf out 44 54 64        # 单页渲染
  python tools/render-pdf.py book.pdf out sheet:330 345  # 生成联系表（定位用）
  python tools/render-pdf.py --sheet book.pdf out 330-360 # 页码范围联系表

页码：**PDF 页码（1 起）**，不是书上页码。书上页码 + 偏移 = PDF 页码，
      偏移必须先用「渲染一页读页脚」校准（各册不同，实测初级上/下 +17、中级上 +12）。

两条铁律（踩过坑，别省）
  1. 读内容用 **一页一图 1400px**。一屏拼多页会把邻页内容误读成当前页。
  2. 画布宽度超过约 1600px 会被压缩，反而更糊 —— 1400px 是清晰度上限的最优解。
  联系表（--sheet）只用于**定位**（找目录页、找生词表在第几页），不要用来读正文。

依赖：pip install pypdfium2 pillow
"""
import sys
import os


def _load(pdf_path):
    import pypdfium2 as pdfium
    return pdfium.PdfDocument(pdf_path)


def _render_page(pdf, page_no, target_w=1400):
    """渲染 PDF 第 page_no 页（1 起），宽度归一到 target_w。"""
    from PIL import Image
    im = pdf[page_no - 1].render(scale=2.4).to_pil().convert("RGB")
    w, h = im.size
    if w != target_w:
        im = im.resize((target_w, int(h * target_w / w)), Image.LANCZOS)
    return im


def render_pages(pdf_path, out_dir, pages, target_w=1400):
    os.makedirs(out_dir, exist_ok=True)
    pdf = _load(pdf_path)
    print("总页数", len(pdf))
    for p in pages:
        im = _render_page(pdf, p, target_w)
        f = os.path.join(out_dir, "p%03d.png" % p)
        im.save(f)
        print("saved", f, im.size)


def make_sheet(pdf_path, out_dir, pages, thumb_w=330, cols=4):
    """把多页缩略拼成一张联系表，用于**快速定位**结构（目录/生词表/索引在哪页）。"""
    from PIL import Image, ImageDraw
    os.makedirs(out_dir, exist_ok=True)
    pdf = _load(pdf_path)
    items = []
    for p in pages:
        im = pdf[p - 1].render(scale=0.5).to_pil().convert("RGB")
        w, h = im.size
        items.append((p, im.resize((thumb_w, int(h * thumb_w / w)), Image.LANCZOS)))
    ch = max(i.size[1] for _, i in items)
    rows = (len(items) + cols - 1) // cols
    cv = Image.new("RGB", (cols * (thumb_w + 8), rows * (ch + 20)), "white")
    d = ImageDraw.Draw(cv)
    for k, (num, im) in enumerate(items):
        r, c = divmod(k, cols)
        x, y = c * (thumb_w + 8) + 4, r * (ch + 20) + 16
        cv.paste(im, (x, y))
        d.text((x + 2, y - 13), "p" + str(num), fill="black")
    f = os.path.join(out_dir, "sheet.png")
    cv.save(f)
    print("saved", f, cv.size)


def parse_range(spec):
    """'90' -> [90]; '330-360' -> [330..360]; '44,54' -> [44,54]"""
    out = []
    for part in str(spec).split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            out.extend(range(int(a), int(b) + 1))
        else:
            out.append(int(part))
    return out


USAGE = __doc__

if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) < 3:
        print(USAGE)
        sys.exit(1)
    if args[0] == "--sheet":
        pdf_path, out_dir = args[1], args[2]
        make_sheet(pdf_path, out_dir, parse_range(args[3]))
    elif args[0] == "sheet":
        # 兼容旧写法：sheet:<起始页>  后跟页码列表
        pdf_path, out_dir = args[1], args[2]
        pages = []
        for a in args[3:]:
            pages.extend(parse_range(a.replace("sheet:", "")))
        make_sheet(pdf_path, out_dir, pages)
    else:
        pdf_path, out_dir = args[0], args[1]
        pages = []
        for a in args[2:]:
            pages.extend(parse_range(a))
        render_pages(pdf_path, out_dir, pages)
