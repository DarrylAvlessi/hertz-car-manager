import urllib.request
import os

fonts = ['Regular', 'Medium', 'SemiBold', 'Bold', 'Light', 'Italic', 'ExtraBold']
base_url = "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-{}.ttf"
out_dir = r"d:\hertz-car-manager\fonts"
os.makedirs(out_dir, exist_ok=True)

for f in fonts:
    url = base_url.format(f)
    dest = os.path.join(out_dir, f"Montserrat-{f}.ttf")
    print(f"Downloading {f} to {dest}...")
    try:
        urllib.request.urlretrieve(url, dest)
        size = os.path.getsize(dest)
        print(f"Downloaded {f}: {size} bytes")
    except Exception as e:
        print(f"Failed {f}: {e}")

