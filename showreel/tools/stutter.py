# Convert the audio glitch schedule into visual time-remap entries (beats).
import json
d = json.load(open('build/glitch_schedule.json'))
out = []
for e in d['events']:
    if e['type'] == 'repeat':
        out.append({'at': e['start']['beat'], 'until': e['end']['beat'], 'src': e['slice_start']['beat'], 'rate': e.get('playback_rate', 1.0)})
    elif e['type'] == 'tape_stop':
        a, b = e['start']['beat'], e['end']['beat']
        src = e['source_start']['beat']
        n = 10
        for i in range(n):
            u0, u1 = i / n, (i + 1) / n
            um = (u0 + u1) / 2
            rate = (1 - um) ** 1.6
            seg_at = a + (b - a) * u0
            out.append({'at': seg_at, 'until': a + (b - a) * u1, 'src': src, 'rate': rate})
            src += (b - a) / n * rate
json.dump(out, open('build/stutter.json', 'w'), indent=1)
print(len(out), 'entries'); print(out[:3]); print(out[-2:])
