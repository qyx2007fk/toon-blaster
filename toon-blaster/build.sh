#!/bin/sh
cd "$(dirname "$0")"
{ cat src/0_head.html; cat src/1_core.js src/2_world.js src/3_combat.js src/4_game.js; printf '\n</script>\n</body>\n</html>\n'; } > index.html
