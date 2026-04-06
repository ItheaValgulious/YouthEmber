import json
from collections import Counter, defaultdict
from pathlib import Path

p = Path('1775456255537-ashdairy-ai-jobs-2026-04-06.json')
raw = p.read_text(encoding='utf-8')

# Repair unescaped newlines inside JSON strings
out = []
in_str = False
esc = False
for ch in raw:
    if in_str:
        if esc:
            out.append(ch)
            esc = False
        else:
            if ch == '\\\\':
                out.append(ch)
                esc = True
            elif ch == '"':
                out.append(ch)
                in_str = False
            elif ch == '\n':
                out.append('\\\\n')
            elif ch == '\r':
                out.append('\\\\r')
            else:
                out.append(ch)
    else:
        out.append(ch)
        if ch == '"':
            in_str = True

fixed = ''.join(out)
data = json.loads(fixed)
jobs = data.get('ai_jobs', [])

def g(obj, key, default=None):
    v = obj.get(key, default)
    return v if v is not None else default

# Flatten payload fields used in analysis
rows = []
for j in jobs:
    payload = j.get('payload') or {}
    row = {
        'status': j.get('status'),
        'type': j.get('type'),
        'phase': payload.get('phase'),
        'event_id': payload.get('event_id'),
        'friend_id': payload.get('friend_id'),
        'source_comment_id': payload.get('source_comment_id'),
        'reply_to_comment_id': payload.get('reply_to_comment_id'),
        'comment': payload.get('comment')
    }
    rows.append(row)

print(f"TotalJobs={len(rows)}")

for label,key in [('CountsByStatus','status'),('CountsByType','type'),('CountsByPhase','phase')]:
    c = Counter(r.get(key) for r in rows)
    parts = [f"{k}:{v}" for k,v in c.most_common()]
    print(f"{label}=" + ', '.join(parts))

fcg = [r for r in rows if r.get('type')=='friend_comment' and r.get('phase')=='generate']
fcg_counter = Counter((r.get('event_id'), r.get('friend_id'), r.get('source_comment_id')) for r in fcg)
print(f"FriendCommentGenerateGroups={len(fcg_counter)}")
for (event_id,friend_id,source_comment_id),cnt in fcg_counter.most_common(15):
    print(f"FCG event={event_id} friend={friend_id} source={source_comment_id} count={cnt}")

exact_counter = Counter((r.get('status'), r.get('phase'), r.get('event_id'), r.get('friend_id'), r.get('source_comment_id'), r.get('reply_to_comment_id'), r.get('comment')) for r in rows)
dups = [(k,v) for k,v in exact_counter.items() if v>1]
dups.sort(key=lambda x: x[1], reverse=True)
print(f"ExactDuplicateGroups={len(dups)}")
print(f"ExactDuplicateRowsTotal={sum(v for _,v in dups)}")
for k,v in dups[:10]:
    status,phase,event_id,friend_id,source_comment_id,reply_to_comment_id,comment = k
    text = '<EMPTY>' if not (comment and str(comment).strip()) else ' '.join(str(comment).split())[:80]
    print(f"DUP status={status} phase={phase} event={event_id} friend={friend_id} source={source_comment_id} replyTo={reply_to_comment_id} count={v} comment='{text}'")

comment_counter = Counter(r.get('comment') for r in rows)
rep_comments = [(k,v) for k,v in comment_counter.items() if v>1]
rep_comments.sort(key=lambda x: x[1], reverse=True)
print(f"RepeatedCommentTexts={len(rep_comments)}")
for text,count in rep_comments[:10]:
    t = '<EMPTY>' if not (text and str(text).strip()) else ' '.join(str(text).split())[:100]
    print(f"COMMENT count={count} text='{t}'")
