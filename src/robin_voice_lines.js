// Complete local reference-conditioned Robin voice pack; see docs/ROBIN_CAT_VOICE.md.
(function (root) {
  'use strict';
  const lines = {
  "start_1": {
    "text": "Mine! Go fetch your own.",
    "src": "assets/voice/robin/en/robin-local-v3/start_1.ogg?v=222de4926dd5c153",
    "durationSeconds": 2.22
  },
  "start_2": {
    "text": "Your bone? You mean my bone.",
    "src": "assets/voice/robin/en/robin-local-v3/start_2.ogg?v=81ebf3316053aa17",
    "durationSeconds": 2.18
  },
  "wave_early_1": {
    "text": "Fetch! I didn't even throw anything.",
    "src": "assets/voice/robin/en/robin-local-v3/wave_early_1.ogg?v=0968b09de03e1812",
    "durationSeconds": 2.22
  },
  "wave_early_2": {
    "text": "Ding-dong! Made you bark.",
    "src": "assets/voice/robin/en/robin-local-v3/wave_early_2.ogg?v=0c3aad27b1405905",
    "durationSeconds": 2.86
  },
  "wave_mid_1": {
    "text": "I open ONE treat bag...",
    "src": "assets/voice/robin/en/robin-local-v3/wave_mid_1.ogg?v=cc81c9a3ba5c8dff",
    "durationSeconds": 2.46
  },
  "wave_mid_2": {
    "text": "Who's guarding the fridge? Amateur mistake.",
    "src": "assets/voice/robin/en/robin-local-v3/wave_mid_2.ogg?v=eed992920ba74202",
    "durationSeconds": 3.1
  },
  "wave_late_1": {
    "text": "You brought the whole obedience class?",
    "src": "assets/voice/robin/en/robin-local-v3/wave_late_1.ogg?v=e256ab0c86b7e95d",
    "durationSeconds": 2.18
  },
  "wave_late_2": {
    "text": "Still chasing your tail? Any progress?",
    "src": "assets/voice/robin/en/robin-local-v3/wave_late_2.ogg?v=88ff067ed83a1db1",
    "durationSeconds": 2.98
  },
  "boss_enter": {
    "text": "You're huge. Your bed must be incredible.",
    "src": "assets/voice/robin/en/robin-local-v3/boss_enter.ogg?v=035e98dd27dbc28f",
    "durationSeconds": 3.7
  },
  "boss_enter_2": {
    "text": "So big. So scared of the vacuum.",
    "src": "assets/voice/robin/en/robin-local-v3/boss_enter_2.ogg?v=21e96b0ec9ca37a9",
    "durationSeconds": 3.4
  },
  "final_boss_enter": {
    "text": "King? I saw you eat a sock.",
    "src": "assets/voice/robin/en/robin-local-v3/final_boss_enter.ogg?v=0960c7889a77b3d3",
    "durationSeconds": 2.54
  },
  "final_boss_enter_2": {
    "text": "Fancy crown. Still drinks from the toilet.",
    "src": "assets/voice/robin/en/robin-local-v3/final_boss_enter_2.ogg?v=a7ee768a88c3b6fb",
    "durationSeconds": 3.2
  },
  "boss_rage": {
    "text": "Aww. Somebody heard the bath running.",
    "src": "assets/voice/robin/en/robin-local-v3/boss_rage.ogg?v=a46aa3941e31f550",
    "durationSeconds": 4.1
  },
  "boss_rage_2": {
    "text": "Who's upset? Is it you? It's you!",
    "src": "assets/voice/robin/en/robin-local-v3/boss_rage_2.ogg?v=f476dbc7e6fa3924",
    "durationSeconds": 4.6
  },
  "boss_defeated": {
    "text": "Good sit. Terrible timing.",
    "src": "assets/voice/robin/en/robin-local-v3/boss_defeated.ogg?v=8122238b341e6b48",
    "durationSeconds": 2.1
  },
  "boss_defeated_2": {
    "text": "Stay! Finally, a trick you can do.",
    "src": "assets/voice/robin/en/robin-local-v3/boss_defeated_2.ogg?v=acd42fc1c31890e2",
    "durationSeconds": 3.2
  },
  "final_boss_defeated": {
    "text": "Your throne's my nap spot now.",
    "src": "assets/voice/robin/en/robin-local-v3/final_boss_defeated.ogg?v=9c624a76f1be619a",
    "durationSeconds": 2.5
  },
  "clear_1": {
    "text": "Your bed? Adorable theory.",
    "src": "assets/voice/robin/en/robin-local-v3/clear_1.ogg?v=8d54f9e1e85e0f12",
    "durationSeconds": 2.5
  },
  "clear_2": {
    "text": "I did all that without a biscuit.",
    "src": "assets/voice/robin/en/robin-local-v3/clear_2.ogg?v=e4e605ba9f3703e1",
    "durationSeconds": 2.14
  },
  "dual": {
    "text": "Two arrows. Go on, fetch both.",
    "src": "assets/voice/robin/en/robin-local-v3/dual.ogg?v=cf9d4b6fe8010dee",
    "durationSeconds": 2.5
  },
  "dual_2": {
    "text": "I brought a spare. You'll fetch it.",
    "src": "assets/voice/robin/en/robin-local-v3/dual_2.ogg?v=d121a9e55b006861",
    "durationSeconds": 2.46
  },
  "triple": {
    "text": "Fetch all three. I'll supervise.",
    "src": "assets/voice/robin/en/robin-local-v3/triple.ogg?v=d05cff72f092565e",
    "durationSeconds": 2.22
  },
  "triple_2": {
    "text": "Three arrows, puppy. Fetch every last one.",
    "src": "assets/voice/robin/en/robin-local-v3/triple_2.ogg?v=386a5310ec99091b",
    "durationSeconds": 3.2
  },
  "rapid": {
    "text": "I'm not hissing. That's the bow.",
    "src": "assets/voice/robin/en/robin-local-v3/rapid.ogg?v=10c1973cf48fca14",
    "durationSeconds": 3.3
  },
  "rapid_2": {
    "text": "Wait. Where's the off button?",
    "src": "assets/voice/robin/en/robin-local-v3/rapid_2.ogg?v=3e87795c2249c02a",
    "durationSeconds": 2.22
  },
  "spread": {
    "text": "Oh, we're doing the whole pack?",
    "src": "assets/voice/robin/en/robin-local-v3/spread.ogg?v=b96668bd59b0cb8c",
    "durationSeconds": 2.26
  },
  "spread_2": {
    "text": "Your whole pack? Fine. Group discount!",
    "src": "assets/voice/robin/en/robin-local-v3/spread_2.ogg?v=84bc03608818c2ee",
    "durationSeconds": 3.4
  },
  "laser": {
    "text": "Ooh, a dot! Not now, Robin.",
    "src": "assets/voice/robin/en/robin-local-v3/laser.ogg?v=9297fcd989dd69d8",
    "durationSeconds": 2.86
  },
  "laser_2": {
    "text": "Chase the shiny thing. I dare you.",
    "src": "assets/voice/robin/en/robin-local-v3/laser_2.ogg?v=bd993cd948405fe3",
    "durationSeconds": 3.1
  },
  "shield": {
    "text": "Lick the bubble. See how that goes.",
    "src": "assets/voice/robin/en/robin-local-v3/shield.ogg?v=b2712dde6a757dfe",
    "durationSeconds": 3.3
  },
  "shield_2": {
    "text": "Drool stays outside. House rules.",
    "src": "assets/voice/robin/en/robin-local-v3/shield_2.ogg?v=b9f3cb4c0bde9526",
    "durationSeconds": 2.98
  },
  "speed": {
    "text": "Chase your tail! Not mine!",
    "src": "assets/voice/robin/en/robin-local-v3/speed.ogg?v=3f83177b06ce7014",
    "durationSeconds": 2.18
  },
  "speed_2": {
    "text": "Catch me! Wait, too close!",
    "src": "assets/voice/robin/en/robin-local-v3/speed_2.ogg?v=497ac55da83a2866",
    "durationSeconds": 2.82
  },
  "life": {
    "text": "Another life. Still not sharing.",
    "src": "assets/voice/robin/en/robin-local-v3/life.ogg?v=dece5288160881ee",
    "durationSeconds": 2.82
  },
  "bomb": {
    "text": "I touched ONE thing!",
    "src": "assets/voice/robin/en/robin-local-v3/bomb.ogg?v=c5176819c1e95d2a",
    "durationSeconds": 2.1
  },
  "hit": {
    "text": "Hey! We said pretend biting!",
    "src": "assets/voice/robin/en/robin-local-v3/hit.ogg?v=1b846291078bbf05",
    "durationSeconds": 3.1
  },
  "hit_2": {
    "text": "Ow! I'm telling our human!",
    "src": "assets/voice/robin/en/robin-local-v3/hit_2.ogg?v=478dece97d959ea6",
    "durationSeconds": 2.46
  },
  "last_life": {
    "text": "We can share! No, we can't.",
    "src": "assets/voice/robin/en/robin-local-v3/last_life.ogg?v=9858e1c2ecf6d646",
    "durationSeconds": 2.86
  },
  "last_life_2": {
    "text": "One life left. Still keeping the bone.",
    "src": "assets/voice/robin/en/robin-local-v3/last_life_2.ogg?v=1945726469827a7a",
    "durationSeconds": 2.86
  },
  "game_over_1": {
    "text": "Tell anyone, and I'm taking your bed.",
    "src": "assets/voice/robin/en/robin-local-v3/game_over_1.ogg?v=0ec015fa173c1b44",
    "durationSeconds": 2.38
  },
  "game_over_2": {
    "text": "I let you win. Don't wag.",
    "src": "assets/voice/robin/en/robin-local-v3/game_over_2.ogg?v=f708ee4deecb2780",
    "durationSeconds": 2.22
  },
  "wave_early_3": {
    "text": "Guaranteed returns? Even fetch isn't guaranteed.",
    "src": "assets/voice/robin/en/robin-local-v3/wave_early_3.ogg?v=3d99afe9649c49b7",
    "durationSeconds": 4.2
  },
  "wave_mid_3": {
    "text": "All bark. No dividends.",
    "src": "assets/voice/robin/en/robin-local-v3/wave_mid_3.ogg?v=81b42fb6699cdfc5",
    "durationSeconds": 2.66
  },
  "wave_late_3": {
    "text": "Scammer in a collar. How original.",
    "src": "assets/voice/robin/en/robin-local-v3/wave_late_3.ogg?v=25d5cb29f36cc55a",
    "durationSeconds": 3.6
  },
  "boss_enter_3": {
    "text": "Wolf of Wall Street? Sit.",
    "src": "assets/voice/robin/en/robin-local-v3/boss_enter_3.ogg?v=382e5128c810c14a",
    "durationSeconds": 2.26
  },
  "boss_rage_3": {
    "text": "Short my stock? I'll shorten your leash.",
    "src": "assets/voice/robin/en/robin-local-v3/boss_rage_3.ogg?v=92b5de8abb3ab144",
    "durationSeconds": 2.58
  },
  "boss_defeated_3": {
    "text": "Your biscuits are under new management.",
    "src": "assets/voice/robin/en/robin-local-v3/boss_defeated_3.ogg?v=fe5a306a90410328",
    "durationSeconds": 2.46
  },
  "final_boss_defeated_2": {
    "text": "Hostile takeover. I sleep here now.",
    "src": "assets/voice/robin/en/robin-local-v3/final_boss_defeated_2.ogg?v=16efde7586a358e7",
    "durationSeconds": 2.94
  },
  "clear_3": {
    "text": "My portfolio? Mostly stolen dog beds.",
    "src": "assets/voice/robin/en/robin-local-v3/clear_3.ogg?v=78772ecfc1884927",
    "durationSeconds": 3.2
  },
  "clear_4": {
    "text": "Puppy paper hands, out! Now send it!",
    "src": "assets/voice/robin/en/robin-local-v3/clear_4.ogg?v=febc9af21110a990",
    "durationSeconds": 3.4
  },
  "triple_3": {
    "text": "Three arrows. That's my diversification.",
    "src": "assets/voice/robin/en/robin-local-v3/triple_3.ogg?v=48e5717ffdc8f70c",
    "durationSeconds": 3.5
  },
  "rapid_3": {
    "text": "More arrows. Same dodgy business model.",
    "src": "assets/voice/robin/en/robin-local-v3/rapid_3.ogg?v=deabe709922afb59",
    "durationSeconds": 3.7
  },
  "laser_3": {
    "text": "Finally, a straight line on the chart.",
    "src": "assets/voice/robin/en/robin-local-v3/laser_3.ogg?v=c94939239e1ac238",
    "durationSeconds": 2.5
  },
  "shield_3": {
    "text": "Bailout approved. Strictly for the cat.",
    "src": "assets/voice/robin/en/robin-local-v3/shield_3.ogg?v=f2f77d2e2841bacc",
    "durationSeconds": 3.1
  },
  "speed_3": {
    "text": "Chasing returns. Also your ankles.",
    "src": "assets/voice/robin/en/robin-local-v3/speed_3.ogg?v=ab2819e49a163902",
    "durationSeconds": 3.3
  },
  "life_2": {
    "text": "Nine lives. Zero risk management.",
    "src": "assets/voice/robin/en/robin-local-v3/life_2.ogg?v=b06a18fa2546b828",
    "durationSeconds": 3.3
  },
  "hit_3": {
    "text": "Rug pull? I was scratching that.",
    "src": "assets/voice/robin/en/robin-local-v3/hit_3.ogg?v=d6099982ecf54e1c",
    "durationSeconds": 2.66
  },
  "last_life_3": {
    "text": "Diamond paws. Questionable life choices.",
    "src": "assets/voice/robin/en/robin-local-v3/last_life_3.ogg?v=c5bc872070abab96",
    "durationSeconds": 3.6
  },
  "game_over_3": {
    "text": "Just a correction. Rather a large one.",
    "src": "assets/voice/robin/en/robin-local-v3/game_over_3.ogg?v=e79fa382fd80223a",
    "durationSeconds": 3.5
  },
  "game_over_4": {
    "text": "Buy the dip? I fell in.",
    "src": "assets/voice/robin/en/robin-local-v3/game_over_4.ogg?v=fcd27fc3f4aaa1b3",
    "durationSeconds": 2.22
  }
};
  Object.values(lines).forEach(Object.freeze);
  Object.freeze(lines);
  root.ROBIN_VOICE_LINES = lines;
  if (typeof module !== 'undefined' && module.exports) module.exports = lines;
})(typeof globalThis !== 'undefined' ? globalThis : window);
