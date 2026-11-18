"""Fit closed surfaces to the album chair pose. Requires NumPy and ImageMagick.

Coordinates are pixels in a 650px-wide copy of photo 17. Each silhouette is
traced in that frame. Heights above the pillow and thickness along the viewing
ray give the model depth. The photograph directly supplies the visible colors.
"""
import base64
import json
from pathlib import Path
import subprocess

import numpy as np

DOCS = Path(__file__).resolve().parents[1] / "docs"
SCALE = 265
ANGLE = 42
ORIGIN = [332, 207]


def photo(number):
    data = subprocess.check_output(["magick", str(DOCS / f"photos/{number:02}.webp"),
                                   "-resize", "1300x974!", "-depth", "8", "rgb:-"])
    return np.frombuffer(data, np.uint8).reshape(974, 1300, 3)


chair = photo(17)
curled = photo(3)
sleeping = photo(15)


def sample(image, x, y):
    x = np.clip(2*x+.5, 0, image.shape[1]-1.001)
    y = np.clip(2*y+.5, 0, image.shape[0]-1.001)
    ix, iy = x.astype(int), y.astype(int)
    dx, dy = (x-ix)[..., None], (y-iy)[..., None]
    return ((1-dy)*((1-dx)*image[iy,ix]+dx*image[iy,ix+1])
            + dy*((1-dx)*image[iy+1,ix]+dx*image[iy+1,ix+1]))


def spline(points, t):
    values = np.array(points, dtype=float)
    p = np.clip(t, 0, 1)*(len(points)-1)
    i = np.minimum(p.astype(int), len(points)-2)
    f = (p-i)[..., None]
    a, b = values[i], values[i+1]
    m = (b-values[np.maximum(0,i-1)])*.5
    n = (values[np.minimum(len(points)-1,i+2)]-a)*.5
    return (2*f**3-3*f*f+1)*a + (f**3-2*f*f+f)*m + (-2*f**3+3*f*f)*b + (f**3-f*f)*n


def lengthwise(points):
    """Vertical silhouette cuts from rump to shoulder: x, top, bottom, height, depth."""
    return [[x,(top+bottom)/2,0,(bottom-top)/2,h,d] for x,top,bottom,h,d in points]


def crosswise(points):
    """Horizontal cuts: y, left, right, height, depth."""
    return [[(left+right)/2,y,(right-left)/2,0,h,d] for y,left,right,h,d in points]


def swept(points):
    """Trace a bent limb using centerline, silhouette half-width, height and depth."""
    rows = []
    for i,(x,y,radius,h,d) in enumerate(points):
        a, b = points[max(0,i-1)], points[min(len(points)-1,i+1)]
        dx, dy = b[0]-a[0], b[1]-a[1]
        length = np.hypot(dx,dy)
        rows.append([x,y,-dy*radius/length,dx*radius/length,h,d])
    return rows


# The tail starts under the rump, passes down the outside of the white hind
# foot and returns around it. Its photographed blunt tip is at (261, 211).
shapes = {
    "body": lengthwise([
        (201,139,139,.13,0),(214,118,162,.14,.111),(230,102,176,.162,.153),
        (245,95,187,.176,.183),(264,96,192,.181,.198),(283,97,196,.184,.195),
        (302,93,200,.188,.195),(323,95,202,.195,.204),(343,101,203,.20,.20),
        (361,103,210,.212,.205),(380,101,217,.22,.202),(401,103,220,.222,.19),
        (422,106,215,.232,.187),(442,111,207,.235,.174),(460,120,192,.246,.135),
        (478,139,174,.254,.084),(486,157,157,.25,0)]),
    "backFoot": swept([
        (233,139,0,.115,0),(233,151,10,.095,.051),(227,167,11,.067,.052),
        (216,181,10,.06,.05),(211,190,9,.062,.046),(209,198,0,.060,0)]),
    "hindPaw": swept([
        (247,149,0,.145,0),(254,163,9,.121,.055),(252,179,9,.096,.053),
        (251,192,9,.077,.046),(253,204,8,.072,.043),(254,213,0,.065,0)]),
    "tail": swept([
        (281,116,0,.166,0),(264,110,12,.183,.072),(243,109,14,.165,.075),
        (224,119,14,.147,.074),(207,133,14,.123,.072),(198,148,14,.102,.068),
        (191,163,14,.083,.065),(186,179,13,.069,.060),(188,194,13,.056,.056),
        (198,207,13,.054,.054),(214,216,12,.055,.054),(230,217,12,.058,.052),
        (244,215,11,.067,.050),(254,213,8,.075,.042),(259,211,5,.079,.029),
        (262,210,0,.080,0)]),
    "shortForeleg": crosswise([
        (179,354,354,.194,0),(191,342,370,.164,.078),(207,340,373,.139,.086),
        (225,341,373,.11,.071),(244,343,373,.09,.067),(257,345,373,.07,.059),
        (268,344,377,.054,.057),(280,343,377,.049,.052),(292,343,373,.044,.049),
        (302,347,369,.039,.038),(308,350,364,.035,.022),(311,356,356,.037,0)]),
    "longForeleg": crosswise([
        (206,446,446,.177,0),(220,430,463,.153,.082),(241,424,465,.120,.079),
        (260,420,464,.088,.072),(280,419,461,.070,.066),(299,417,461,.052,.060),
        (315,419,461,.032,.056),(330,423,461,.009,.051),(345,423,461,-.027,.053),
        (355,420,461,-.061,.056),(367,418,458,-.101,.056),(378,419,455,-.135,.053),
        (386,423,453,-.153,.046),(393,428,448,-.173,.033),(398,437,437,-.18,0)]),
    "head": crosswise([
        (139,446,446,.289,0),(146,425,468,.293,.108),(158,412,484,.289,.161),
        (173,400,491,.277,.179),(189,394,496,.260,.185),(205,391,493,.234,.182),
        (218,393,485,.205,.164),(232,396,474,.183,.145),(243,401,464,.158,.121),
        (251,408,452,.138,.092),(258,411,436,.119,.062),(264,420,427,.111,.036),
        (266,423,423,.106,0)]),
    "nearEar": swept([
        (428,202,0,.28,0),(419,200,9,.293,.04),(411,194,14,.305,.051),
        (405,184,12,.329,.05),(402,178,8,.353,.041),(399,175,0,.368,0)]),
    "farEar": swept([
        (474,201,0,.251,0),(483,204,12,.271,.052),(493,209,16,.279,.054),
        (504,213,14,.274,.052),(514,216,10,.267,.04),(521,218,4,.261,.027),
        (523,218,0,.259,0)]),
}


def hidden_colors(name, t, c, x, y):
    # Other album views guide the side facing into the pillow. No photograph
    # records that side in this pose. Keep the face and ear markings on the
    # camera-facing skin exclusively so a second face cannot appear on rotation.
    if name == "body":
        return sample(curled, 554-250*t+15*c, 226-79*t+63*c)
    if name == "head":
        return sample(sleeping, 289+22*c+15*t, 208+15*t+6*c)
    if name in ("nearEar", "farEar"):
        return sample(chair, 459+10*c, 169+11*t)
    if name == "longForeleg":
        underside = sample(chair, 444+7*c, 322+12*t)
        weight = np.clip((t-.68)/.18,0,1)[...,None]
        return sample(chair,x,y)*(1-weight) + underside*weight
    return sample(chair,x,y)


def encode(rgb):
    h,w = rgb.shape[:2]
    jpeg = subprocess.check_output(["magick", "-size", f"{w}x{h}", "-depth", "8", "rgb:-",
                                    "-sampling-factor", "4:4:4", "-quality", "93", "jpeg:-"],
                                   input=np.uint8(np.clip(rgb,0,255)).tobytes())
    return "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()


def build(name, points):
    width, height = (768,768) if name in ("head","body","tail") else (384,512)
    # The geometry and atlas use the same interpolated sections. At the source
    # angle every visible texel projects back to its original photograph pixel.
    rows = spline(points,np.linspace(0,1,97))
    t = 1-(np.arange(height)[:,None]+.5)/height
    r = np.array([np.interp(t[:,0],np.linspace(0,1,len(rows)),col) for col in rows.T])
    angle = 2*np.pi*(np.arange(width)[None,:]+.5)/width
    c,s = np.cos(angle),np.sin(angle)
    # Pull only the outermost texels inward to exclude background at the silhouette.
    sample_c = c*(1-.045*np.abs(c)**12)
    x = r[0,:,None]+r[2,:,None]*sample_c
    y = r[1,:,None]+r[3,:,None]*sample_c
    visible = sample(chair,x,y)
    hidden = hidden_colors(name,t,c,x,y)
    w = np.clip(-s/.6,0,1)
    w = (w*w*(3-2*w))[...,None]
    pixels = visible*(1-w)+hidden*w
    return {"rings":np.round(rows,4).tolist(), "map":encode(pixels)}


parts = {name:build(name, points) for name,points in shapes.items()}
reference = {"scale":SCALE, "elevation":ANGLE, "origin":ORIGIN, "parts":parts}
(DOCS/"coat.js").write_text("// Generated by tools/bake-coat.py from the album.\n"
                            + "const catReference = "+json.dumps(reference,separators=(",",":"))+";\n")
