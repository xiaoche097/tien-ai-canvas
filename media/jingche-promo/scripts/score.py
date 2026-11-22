"""为 30 秒境彻介绍片合成原创电子节奏与转场音效。"""
import math
import random
import wave
from array import array
from pathlib import Path

rate = 44100
duration = 30
rng = random.Random(42)
buf = array('f', [0.0]) * (rate * duration)

def tone(start, length, fn, gain=1):
    offset = int(start * rate)
    for i in range(min(int(length * rate), len(buf) - offset)):
        t = i / rate
        buf[offset + i] += gain * fn(t, length)

# 120 BPM kick, restrained hats and a repeating minor arpeggio.
notes = [110, 164.8138, 220, 261.6256, 164.8138, 220, 329.6276, 261.6256]
for k in range(60):
    start = k * .5
    tone(start, .32, lambda t,d: math.sin(2*math.pi*(48*t+14*(1-math.exp(-t*35))/35))*math.exp(-t*17), .37)
    tone(start+.25, .06, lambda t,d: rng.uniform(-1,1)*math.exp(-t*85), .035)
    hz = notes[k % len(notes)]
    tone(start, .42, lambda t,d,h=hz: (math.sin(2*math.pi*h*t)+.24*math.sin(2*math.pi*h*2*t))*math.exp(-t*9)*min(1,t*180), .10)
    if k % 4 == 2:
        tone(start, .14, lambda t,d: rng.uniform(-1,1)*math.exp(-t*30), .065)
for at in [3.5, 9, 15, 21, 26.5]:
    tone(at-.22, .7, lambda t,d: rng.uniform(-1,1)*math.sin(math.pi*t/d)**3, .09)
    tone(at, .65, lambda t,d: math.sin(2*math.pi*65*t)*math.exp(-t*7), .22)
for hz in [130.8128, 164.8138, 195.9977]:
    tone(0,30,lambda t,d,h=hz: math.sin(2*math.pi*h*t)*(.7+.3*math.sin(t*.4)), .012)
peak = max(abs(v) for v in buf)
out = array('h')
for i, v in enumerate(buf):
    t=i/rate
    fade=min(1,t/.25,(duration-t)/1.1)
    a=int(max(-1,min(1,v/peak*.83*fade))*32767)
    out.extend([a,a])
path=Path(__file__).resolve().parents[1]/'public'/'score.wav'
with wave.open(str(path),'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(rate)
    w.writeframes(out.tobytes())
print('原创电子配乐已生成')
