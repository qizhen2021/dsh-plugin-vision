import sys
from PIL import Image, ImageDraw, ImageFont

def font(size):
    for p in ["/System/Library/Fonts/PingFang.ttc",
              "/System/Library/Fonts/STHeiti Light.ttc",
              "/System/Library/Fonts/Hiragino Sans GB.ttc",
              "/System/Library/Fonts/Supplemental/Songti.ttc"]:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()

# --- 1. 中文仪表盘 UI ---
img = Image.new("RGB", (800, 520), (245, 247, 250))
d = ImageDraw.Draw(img)
f_title = font(22); f_body = font(17); f_small = font(14)
d.rectangle([0, 0, 800, 56], fill=(31, 41, 55))
d.text((24, 16), "数据监控中心", font=f_title, fill=(255, 255, 255))
d.rectangle([0, 56, 180, 520], fill=(255, 255, 255))
d.text((24, 90), "首页", font=f_body, fill=(30, 64, 175))
d.text((24, 130), "报表", font=f_body, fill=(100, 116, 139))
d.text((24, 170), "用户管理", font=f_body, fill=(100, 116, 139))
d.rectangle([210, 90, 490, 220], fill=(255, 255, 255), outline=(226, 232, 240))
d.text((230, 110), "今日订单", font=f_body, fill=(51, 65, 85))
d.text((230, 140), "1,284", font=f_title, fill=(15, 23, 42))
d.rectangle([520, 90, 770, 220], fill=(255, 255, 255), outline=(226, 232, 240))
d.text((540, 110), "活跃用户", font=f_body, fill=(51, 65, 85))
d.text((540, 140), "3,672", font=f_title, fill=(15, 23, 42))
d.rectangle([540, 170, 660, 198], fill=(22, 163, 74))
d.text((556, 174), "查看详情", font=f_small, fill=(255, 255, 255))
d.rectangle([210, 250, 770, 290], fill=(254, 242, 242), outline=(252, 165, 165))
d.text((230, 260), "警告：存储空间剩余 8%", font=f_body, fill=(185, 28, 28))
d.rectangle([210, 330, 770, 350], fill=(226, 232, 240))
d.rectangle([210, 330, 420, 350], fill=(59, 130, 246))
d.text((210, 360), "磁盘使用率 42%", font=f_small, fill=(71, 85, 105))
img.save("/tmp/ui_cn.png")
print("UI_CN_OK")

# --- 2. 柱状图: 季度销售额 ---
img2 = Image.new("RGB", (680, 460), (255, 255, 255))
d2 = ImageDraw.Draw(img2)
d2.text((30, 20), "季度销售额（万元）", font=f_title, fill=(30, 41, 59))
d2.rectangle([80, 70, 640, 400], outline=(203, 213, 225))
data = [("Q1", 120, (59, 130, 246)), ("Q2", 185, (16, 185, 129)), ("Q3", 95, (245, 158, 11)), ("Q4", 240, (239, 68, 68))]
bw, gap, base, top = 80, 40, 400, 70
scale = (base - top) / 250
for i, (label, val, color) in enumerate(data):
    x0 = 100 + i * (bw + gap)
    h = int(val * scale)
    d2.rectangle([x0, base - h, x0 + bw, base], fill=color)
    d2.text((x0 + bw // 2 - 12, base - h - 28), str(val), font=f_body, fill=(30, 41, 59))
    d2.text((x0 + bw // 2 - 10, base + 8), label, font=f_body, fill=(71, 85, 105))
for gv in [50, 100, 150, 200, 250]:
    gy = base - int(gv * scale)
    d2.line([80, gy, 640, gy], fill=(241, 245, 249))
    d2.text((40, gy - 10), str(gv), font=f_small, fill=(148, 163, 184))
d2.text((80, 420), "数据来源：销售系统", font=f_small, fill=(148, 163, 184))
img2.save("/tmp/chart.png")
print("CHART_OK")
