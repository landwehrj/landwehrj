"""Create the offline gallery atlas and the garden's original ambient loop."""
import base64
import json
from pathlib import Path
import subprocess
import numpy as np

DOCS = Path(__file__).resolve().parents[1] / 'docs'


def photo_atlas():
    # A local file URL cannot be uploaded directly to a WebGL texture. Pack the
    # reduced photographs once. The album still opens the full-resolution files.
    atlas = np.zeros((2048, 2048, 3), np.uint8)
    regions = {}
    for i in range(17):
        path = DOCS / f'photos/{i+1:02}.webp'
        w, h = map(int, subprocess.check_output(['magick', 'identify', '-format', '%w %h', str(path)]).split())
        k = min(500/w, 393/h, 1)
        width, height = round(w*k), round(h*k)
        pixels = subprocess.check_output(['magick', str(path), '-resize', f'{width}x{height}!',
                                          '-depth', '8', 'rgb:-'])
        x, y = i%4*512+5, i//4*409+5
        atlas[y:y+height,x:x+width] = np.frombuffer(pixels,np.uint8).reshape(height,width,3)
        regions[i+1] = [x,y,width,height]
    jpg = subprocess.check_output(['magick','-size','2048x2048','-depth','8','rgb:-',
                                   '-quality','85','jpeg:-'],input=atlas.tobytes())
    data = dict(regions=regions, image='data:image/jpeg;base64,'+base64.b64encode(jpg).decode())
    (DOCS/'garden-atlas.js').write_text('const gardenAtlas = '+json.dumps(data,separators=(',',':'))+';\n')


def score():
    """Render an original harp nocturne. The river ambience plays independently in the browser."""
    rate = 44100
    rng = np.random.default_rng(20060214)
    # Each line is a phrase: seconds, left-hand voicing, then the melody's
    # (beat, MIDI note) pairs. Beats stretch slightly with each breath.
    phrases = [
        (7.4, (49, 56, 60, 65), [(1.0, 68), (2.6, 75), (4.1, 72)]),
        (6.8, (48, 51, 56, 63), [(.5, 70), (2.2, 68), (4.6, 63)]),
        (7.1, (46, 53, 56, 61), [(1.8, 65), (3, 68), (3.8, 73), (5, 72)]),
        (7.9, (42, 49, 53, 58), [(.8, 70), (2.7, 68), (4.4, 65)]),
        (6.7, (51, 58, 61, 65), [(1.2, 68), (2.5, 70), (4.3, 77)]),
        (7.5, (44, 54, 58, 61), [(.7, 75), (2.2, 73), (4.7, 70)]),
        (7.0, (41, 49, 56, 60), [(1.1, 68), (2.1, 65), (4, 63)]),
        (8.1, (44, 51, 58, 60), [(1.6, 63), (3.8, 68)]),
        (7.2, (54, 61, 65, 70), [(.5, 77), (2.0, 80), (4.2, 75)]),
        (6.6, (53, 56, 60, 63), [(.6, 72), (2.7, 75), (3.7, 77)]),
        (7.4, (46, 53, 61, 65), [(1, 80), (2.4, 77), (4.1, 73)]),
        (7.8, (51, 58, 61, 65), [(.8, 75), (2.1, 70), (4.8, 68)]),
        (7.0, (42, 49, 56, 58), [(1.3, 68), (2.8, 75), (4.3, 73)]),
        (6.9, (44, 51, 56, 61), [(.8, 70), (2.6, 68), (4.2, 72)]),
        (7.5, (49, 56, 60, 65), [(1.6, 73), (3.2, 68), (4.9, 65)]),
        (8.3, (44, 51, 58, 63), [(1.0, 63), (3.6, 70), (4.8, 68)]),
    ]
    length = round(sum(phrase[0] for phrase in phrases)*rate)
    mix = np.zeros((length, 2), dtype=np.float32)

    def add(track, start, samples):
        offset = round(start*rate) % length
        first = min(len(samples), length-offset)
        track[offset:offset+first] += samples[:first]
        if first < len(samples):
            track[:len(samples)-first] += samples[first:]

    def place(start, mono, pan):
        angle = pan*np.pi/2
        add(mix[:, 0], start, mono*np.cos(angle))
        add(mix[:, 1], start, mono*np.sin(angle))

    def harp(start, midi, level, harmonic=False):
        hz = 440*2**((midi-69)/12)
        decay = 2.25*(220/hz)**.32
        t = np.arange(round(rate*decay*4.5))/rate
        phase = 2*np.pi*hz*t
        pluck = rng.uniform(.16, .25)
        tone = np.zeros_like(t)
        # A pluck excites different partials depending on where the finger
        # releases the string. Higher partials lose energy first.
        for n in range(1, min(17, int(16000/hz))+1):
            weight = np.sin(n*np.pi*pluck)/(n**1.62*np.sin(np.pi*pluck))
            if harmonic and n % 2 == 0:
                weight *= .22
            damping = np.exp(-t*(1+.40*(n-1)**1.26)/decay)
            tone += weight*damping*np.sin(phase*n*(1+.000017*n*n))
        tone += .19*np.exp(-t/(decay*1.25))*np.sin(phase*1.0008)
        tone *= (1-np.exp(-t/.0045))*np.minimum(1, (len(t)/rate-t)/.12)
        pan = np.clip(.35+(midi-48)*.008+rng.uniform(-.06,.06), .18, .78)
        place(start, level*tone, pan)

    def swell(start, duration, midi, level, pan):
        t = np.arange(round(duration*rate))/rate
        phase = 2*np.pi*440*2**((midi-69)/12)*t
        breath = np.sin(np.pi*t/duration)**2
        voice = .55*np.sin(phase)+.32*np.sin(phase*1.0014)+.13*np.sin(2*phase)
        place(start, level*breath*voice, pan)

    start = 0
    for i, (duration, chord, melody) in enumerate(phrases):
        beat = duration/6
        harp(start+.06, chord[0], .108)
        harp(start+beat*.62, chord[1], .072)
        # Alternate brushed chords and open fifths, leaving space for the tune.
        if i % 4 in (0, 2):
            for j, pitch in enumerate(chord[1:]):
                harp(start+beat*(3.14+j*.105), pitch, .049+j*.007)
        else:
            harp(start+beat*2.94, chord[2], .065)
            harp(start+beat*4.13, chord[3], .048)
        for j, (when, pitch) in enumerate(melody):
            harp(start+beat*when+rng.uniform(-.035,.035), pitch, .123 if j==0 else rng.uniform(.087,.115))
        if i in (2, 5, 8, 10, 14):
            harp(start+beat*5.28, melody[-1][1]+12, .034, harmonic=True)
        swell(start-1.4, duration+3.1, chord[1], .022, .24)
        swell(start-.8, duration+2.4, chord[3], .016, .74)
        start += duration

    def color_noise(samples, centers):
        bins = np.fft.rfftfreq(len(samples), 1/rate)
        response = np.zeros_like(bins)
        for hz, width, gain in centers:
            response += gain*np.exp(-.5*((bins-hz)/width)**2)
        response *= np.minimum(bins/120, 1)
        return np.fft.irfft(np.fft.rfft(samples)*response, n=len(samples))

    # A diffuse stereo return wraps into the opening along with the strings.
    # Different early reflections establish width; the late tail loses treble.
    send = mix.mean(axis=1)
    block = 65536
    ir_time = np.arange(round(3.8*rate))/rate
    fft_size = 1 << (block+len(ir_time)-2).bit_length()
    for channel in range(2):
        noise = rng.normal(size=len(ir_time))
        warm = color_noise(noise, [(520, 750, 1), (2200, 1400, .27)])
        impulse = .006*warm*np.exp(-ir_time/.70)
        impulse += .0019*noise*np.exp(-ir_time/.23)
        impulse *= np.minimum(ir_time/.08, 1)
        for delay, gain in ((.037,.12), (.069,.09), (.111,.073), (.174,.041)):
            impulse[round((delay+channel*.009)*rate)] += gain
        spectrum = np.fft.rfft(impulse, fft_size)
        for offset in range(0, length, block):
            chunk = send[offset:offset+block]
            wet = np.fft.irfft(np.fft.rfft(chunk, fft_size)*spectrum, n=fft_size)
            add(mix[:,channel], offset/rate, wet[:len(chunk)+len(impulse)-1])

    mix *= .45/np.max(np.abs(mix))
    subprocess.run(['ffmpeg','-loglevel','error','-y','-f','f32le','-ar',str(rate),
                    '-ac','2','-i','pipe:0','-codec:a','libmp3lame','-q:a','3',
                    '-metadata','title=The Lantern River','-metadata','genre=Ambient',
                    str(DOCS/'lantern-garden.mp3')],input=mix.astype('<f4', copy=False).tobytes(),check=True)


if __name__ == '__main__':
    photo_atlas()
    score()
