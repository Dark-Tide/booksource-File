from fontTools.ttLib import TTFont, TTLibError
from fontTools.pens.areaPen import AreaPen
import os
import re
import unicodedata
import time

def get_glyph_unicode_map(font):
    """获取字体中所有字形的Unicode映射"""
    cmap = font.getBestCmap()
    glyph_map = {}
    for unicode_val, glyph_name in cmap.items():
        glyph_map[glyph_name] = unicode_val
    return glyph_map

def load_font(font_path):
    try:
        print(f"正在加载字体: {os.path.basename(font_path)}")
        font = TTFont(font_path)
        print(f"字体加载成功，包含 {len(font.getGlyphSet())} 个字形")
        return font
    except TTLibError as e:
        print(f"错误: 无法加载字体文件 {font_path}: {e}")
        return None

def compare_fonts(font1_path, font2_path):
    print("开始比较字体...")
    font1 = load_font(font1_path)
    if font1 is None:
        return [], []
    
    font2 = load_font(font2_path)
    if font2 is None:
        return [], []
    
    # 获取字形到Unicode的映射
    print("获取字形映射...")
    glyph_map1 = get_glyph_unicode_map(font1)
    glyph_map2 = get_glyph_unicode_map(font2)
    
    # 获取字形数据
    glyphset1 = font1.getGlyphSet()
    glyphset2 = font2.getGlyphSet()
    
    # 存储匹配结果
    f1_codes = []
    f2_codes = []
    
    # 比较字形
    total_glyphs = len(glyphset1.keys())
    matched_count = 0
    processed_count = 0
    
    print(f"开始比较 {total_glyphs} 个字形...")
    start_time = time.time()
    
    for i, glyph_name in enumerate(glyphset1.keys()):
        processed_count += 1
        
        if processed_count % 100 == 0:
            elapsed = time.time() - start_time
            print(f"已处理 {processed_count}/{total_glyphs} 个字形 ({processed_count/total_glyphs*100:.1f}%), 耗时 {elapsed:.1f}秒")
        
        if glyph_name in glyphset2:
            glyph1 = glyphset1[glyph_name]
            glyph2 = glyphset2[glyph_name]
            
            if hasattr(glyph1, 'draw') and hasattr(glyph2, 'draw'):
                pen1 = AreaPen()
                pen2 = AreaPen()
                
                try:
                    glyph1.draw(pen1)
                    glyph2.draw(pen2)
                    
                    if abs(pen1.value - pen2.value) < 0.1:
                        unicode1 = glyph_map1.get(glyph_name, None)
                        unicode2 = glyph_map2.get(glyph_name, None)
                        
                        if unicode1 is not None and unicode2 is not None and unicode1 != unicode2:
                            f1_codes.append(unicode1)
                            f2_codes.append(unicode2)
                            matched_count += 1
                            
                            if matched_count % 10 == 0:
                                print(f"已找到 {matched_count} 个匹配的字形")
                except Exception as e:
                    continue
    
    font1.close()
    font2.close()
    
    elapsed = time.time() - start_time
    print(f"字体比较完成，共找到 {matched_count} 个匹配的字形，耗时 {elapsed:.1f}秒")
    
    return f1_codes, f2_codes

def is_korean_char(char):
    code = ord(char)
    
    korean_ranges = [
        (0x1100, 0x11FF),    # 韩文字母 (Hangul Jamo)
        (0x3130, 0x318F),    # 韩文兼容字母 (Hangul Compatibility Jamo)
        (0xAC00, 0xD7AF),    # 韩文字音节 (Hangul Syllables)
        (0xA960, 0xA97F),    # 韩文字母扩展-A (Hangul Jamo Extended-A)
        (0xD7B0, 0xD7FF),    # 韩文字母扩展-B (Hangul Jamo Extended-B)
        (0xFFA0, 0xFFDC),    # 半形韩文字母 (Halfwidth Hangul Jamo)
    ]
    
    for start, end in korean_ranges:
        if start <= code <= end:
            return True
    
    return False

def find_font_files(directory, extensions=None):
    if extensions is None:
        extensions = ['.ttf', '.otf', '.woff', '.woff2', '.ttc']
    
    font_files = []
    for root, dirs, files in os.walk(directory):
        for file in files:
            if any(file.lower().endswith(ext) for ext in extensions):
                font_files.append(os.path.join(root, file))
    
    return font_files

def process_fonts(font1_path, font2_path, output_dir):
    if not os.path.exists(font1_path):
        print(f"错误: 找不到基础字体文件 {font1_path}")
        return
    
    if not os.path.exists(font2_path):
        print(f"错误: 找不到加密字体文件 {font2_path}")
        return
    
    print("\n" + "="*50)
    print("开始处理字体文件")
    print("="*50)
    print(f"基础字体 (f1): {os.path.basename(font1_path)}")
    print(f"加密字体 (f2): {os.path.basename(font2_path)}")
    print("="*50)
    
    # 比较字体
    f1_codes, f2_codes = compare_fonts(font1_path, font2_path)
    
    if not f1_codes or not f2_codes:
        print("未找到匹配的字形，程序结束")
        return
    
    print(f"\n开始过滤韩文字符，共有 {len(f1_codes)} 对字符需要处理...")
    
    f1_filtered = []
    f2_filtered = []
    log_entries = []
    korean_count = 0
    
    start_time = time.time()
    
    for i, (f1_code, f2_code) in enumerate(zip(f1_codes, f2_codes)):
        try:
            f1_char = chr(f1_code)
            f2_char = chr(f2_code)
            
            if i % 100 == 0 and i > 0:
                elapsed = time.time() - start_time
                print(f"已处理 {i}/{len(f1_codes)} 对字符 ({i/len(f1_codes)*100:.1f}%)，找到 {korean_count} 个韩文字符，耗时 {elapsed:.1f}秒")
            
            # 检查是否为韩文字符
            if is_korean_char(f2_char):
                # 对f1字符进行NFKC规范化处理
                f1_char_normalized = unicodedata.normalize('NFKC', f1_char)
                
                f1_filtered.append(f1_char_normalized)
                f2_filtered.append(f2_char)
                korean_count += 1
                
                if korean_count % 10 == 0:
                    print(f"已找到 {korean_count} 个韩文字符")
                
                log_entries.append(f"第{i+1}对: f1[\\u{f1_code:04X} {f1_char} -> {f1_char_normalized}] -> f2[\\u{f2_code:04X} {f2_char}] (韩文)")
            else:
                log_entries.append(f"第{i+1}对: f2[\\u{f2_code:04X} {f2_char}] (非韩文)")
        except:
            log_entries.append(f"第{i+1}对: 无法处理字符 (f1: \\u{f1_code:04X}, f2: \\u{f2_code:04X})")
            continue
    
    elapsed = time.time() - start_time
    print(f"字符处理完成，共找到 {korean_count} 个韩文字符，耗时 {elapsed:.1f}秒")
    
    f1_output = os.path.join(output_dir, "f1_korean_chars.txt")
    f2_output = os.path.join(output_dir, "f2_korean_chars.txt")
    log_output = os.path.join(output_dir, "korean_filter_log.txt")
    
    f1_text = ''.join(f1_filtered)
    f2_text = ''.join(f2_filtered)
    
    print(f"\n正在保存结果到文件...")
    with open(f1_output, "w", encoding="utf-8") as f:
        f.write(f1_text)
    
    with open(f2_output, "w", encoding="utf-8") as f:
        f.write(f2_text)
    
    with open(log_output, "w", encoding="utf-8") as f:
        f.write("\n".join(log_entries))
    
    print("\n" + "="*50)
    print("处理完成!")
    print("="*50)
    print(f"找到 {korean_count} 个韩文字符")
    print(f"结果已保存到:")
    print(f"1. {f1_output} (基础字体字符，NFKC规范化，不换行)")
    print(f"2. {f2_output} (加密字体韩文字符，不换行)")
    print(f"3. {log_output} (详细日志)")
    print("="*50)

def main():
    # 字体文件夹路径
    download_path = ""
    
    if not os.path.exists(download_path):
        print(f"错误: 目录不存在 {download_path}")
        return
    
    print("正在扫描目录中的字体文件...")
    font_files = find_font_files(download_path)
    
    if not font_files:
        print("错误: 在目录中找不到任何字体文件")
        print("支持的格式: .ttf, .otf, .woff, .woff2, .ttc")
        return
    
    print(f"找到 {len(font_files)} 个字体文件:")
    for i, font_file in enumerate(font_files, 1):
        print(f"{i}. {os.path.basename(font_file)}")
    
    try:
        print("\n请选择基础字体 (f1):")
        font1_index = int(input("输入序号: ")) - 1
        
        if font1_index < 0 or font1_index >= len(font_files):
            print("错误: 序号无效")
            return
        
        print("\n请选择加密字体 (f2):")
        font2_index = int(input("输入序号: ")) - 1
        
        if font2_index < 0 or font2_index >= len(font_files):
            print("错误: 序号无效")
            return
        
        font1_path = font_files[font1_index]
        font2_path = font_files[font2_index]
        
        process_fonts(font1_path, font2_path, download_path)
        
    except ValueError:
        print("错误: 请输入有效的数字")
    except KeyboardInterrupt:
        print("\n用户中断操作")

if __name__ == "__main__":
    main()
