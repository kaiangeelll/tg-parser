import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(__file__))
import tgfind
import tgsearch

# Test the smart search
tests = ['Гриша Ютубер', 'salfekta', 'Гриша_Ютубер', 'Грек Ютуб']
for q in tests:
    res = tgsearch.smart_search(q, tgfind_rpc=tgfind.rpc)
    results = res.get('results', [])
    candidates = res.get('handle_candidates_tried', [])
    print('Query: ' + q + ' | candidates: ' + str(candidates) + ' | found: ' + str(len(results)))
    for r in results[:4]:
        print('  ' + str(r.get('name','?')) + ' @' + str(r.get('handle','?')) + ' src=' + str(r.get('_source', 'tgfind')))
