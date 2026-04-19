import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

// All holes are centered in a 700x700 region of the world starting at offset (170, 200)
// This gives ~170 units of rough on left/right and ~200+ units top/bottom
const H_OFF_X = 170;
const H_OFF_Y = 200;
const HOLES = [
  {
    id: 1,
    name: 'Pine Meadow',
    par: 4,
    ballStart: { x: H_OFF_X + 100, y: H_OFF_Y + 296 },
    cup: { x: H_OFF_X + 156, y: H_OFF_Y + 36 },
    terrain: {
      tee: { x: H_OFF_X + 86, y: H_OFF_Y + 288, w: 28, h: 20, r: 8 },
      fairway: [
        { x: H_OFF_X + 78, y: H_OFF_Y + 204, w: 44, h: 100, r: 24 },
        { x: H_OFF_X + 86, y: H_OFF_Y + 124, w: 60, h: 104, r: 28 },
        { x: H_OFF_X + 116, y: H_OFF_Y + 56, w: 48, h: 84, r: 24 }
      ],
      green: { x: H_OFF_X + 134, y: H_OFF_Y + 14, w: 48, h: 52, r: 26 }
    },
    slopes: [
      { cx: 0.34, cy: 0.32, strength: 0.54, dir: 'SE' },
      { cx: 0.64, cy: 0.7, strength: 0.42, dir: 'E' }
    ],
    obstacles: [
      { type: 'circle', x: H_OFF_X + 54, y: H_OFF_Y + 216, r: 10, look: 'tree' },
      { type: 'circle', x: H_OFF_X + 144, y: H_OFF_Y + 190, r: 10, look: 'tree' },
      { type: 'circle', x: H_OFF_X + 60, y: H_OFF_Y + 130, r: 12, look: 'tree' }
    ],
    hazards: [
      { type: 'sandRect', x: H_OFF_X + 122, y: H_OFF_Y + 34, w: 20, h: 16 },
      { type: 'sandRect', x: H_OFF_X + 168, y: H_OFF_Y + 40, w: 20, h: 16 }
    ]
  },
  {
    id: 2,
    name: 'Split Gate',
    par: 3,
    ballStart: { x: H_OFF_X + 100, y: H_OFF_Y + 300 },
    cup: { x: H_OFF_X + 164, y: H_OFF_Y + 36 },
    terrain: {
      tee: { x: H_OFF_X + 88, y: H_OFF_Y + 292, w: 24, h: 16, r: 6 },
      fairway: [
        { x: H_OFF_X + 84, y: H_OFF_Y + 208, w: 36, h: 100, r: 20 },
        { x: H_OFF_X + 120, y: H_OFF_Y + 60, w: 52, h: 160, r: 28 }
      ],
      green: { x: H_OFF_X + 140, y: H_OFF_Y + 12, w: 52, h: 52, r: 26 }
    },
    slopes: [
      { cx: 0.24, cy: 0.5, strength: 0.6, dir: 'E' },
      { cx: 0.7, cy: 0.34, strength: 0.36, dir: 'S' }
    ],
    obstacles: [
      { type: 'rect', x: H_OFF_X + 40, y: H_OFF_Y + 184, w: 120, h: 16 },
      { type: 'rect', x: H_OFF_X + 0, y: H_OFF_Y + 112, w: 116, h: 16 }
    ],
    hazards: [{ type: 'sandRect', x: H_OFF_X + 124, y: H_OFF_Y + 104, w: 60, h: 36 }]
  },
  {
    id: 3,
    name: 'Dogleg Drift',
    par: 4,
    ballStart: { x: H_OFF_X + 32, y: H_OFF_Y + 296 },
    cup: { x: H_OFF_X + 168, y: H_OFF_Y + 44 },
    terrain: {
      tee: { x: H_OFF_X + 20, y: H_OFF_Y + 288, w: 24, h: 16, r: 6 },
      fairway: [
        { x: H_OFF_X + 16, y: H_OFF_Y + 220, w: 40, h: 88, r: 20 },
        { x: H_OFF_X + 28, y: H_OFF_Y + 136, w: 84, h: 100, r: 28 },
        { x: H_OFF_X + 112, y: H_OFF_Y + 60, w: 60, h: 96, r: 24 }
      ],
      green: { x: H_OFF_X + 144, y: H_OFF_Y + 20, w: 52, h: 52, r: 26 }
    },
    slopes: [
      { cx: 0.46, cy: 0.25, strength: 0.52, dir: 'SW' },
      { cx: 0.7, cy: 0.72, strength: 0.38, dir: 'W' }
    ],
    obstacles: [
      { type: 'rect', x: H_OFF_X + 48, y: H_OFF_Y + 220, w: 120, h: 16 },
      { type: 'rect', x: H_OFF_X + 32, y: H_OFF_Y + 128, w: 116, h: 16 },
      { type: 'circle', x: H_OFF_X + 144, y: H_OFF_Y + 184, r: 16 }
    ],
    hazards: [
      { type: 'waterRect', x: H_OFF_X + 0, y: H_OFF_Y + 172, w: 48, h: 36 },
      { type: 'sandRect', x: H_OFF_X + 116, y: H_OFF_Y + 96, w: 68, h: 32 }
    ]
  },
  {
    id: 4,
    name: 'Bumper Tunnel',
    par: 4,
    ballStart: { x: H_OFF_X + 24, y: H_OFF_Y + 300 },
    cup: { x: H_OFF_X + 176, y: H_OFF_Y + 28 },
    terrain: {
      tee: { x: H_OFF_X + 12, y: H_OFF_Y + 292, w: 24, h: 16, r: 6 },
      fairway: [
        { x: H_OFF_X + 8, y: H_OFF_Y + 228, w: 40, h: 80, r: 20 },
        { x: H_OFF_X + 40, y: H_OFF_Y + 156, w: 72, h: 88, r: 28 },
        { x: H_OFF_X + 120, y: H_OFF_Y + 44, w: 60, h: 112, r: 24 }
      ],
      green: { x: H_OFF_X + 152, y: H_OFF_Y + 4, w: 48, h: 48, r: 24 }
    },
    slopes: [
      { cx: 0.3, cy: 0.28, strength: 0.5, dir: 'SE' },
      { cx: 0.74, cy: 0.62, strength: 0.44, dir: 'NW' }
    ],
    obstacles: [
      { type: 'rect', x: H_OFF_X + 0, y: H_OFF_Y + 212, w: 144, h: 16 },
      { type: 'rect', x: H_OFF_X + 56, y: H_OFF_Y + 140, w: 144, h: 16 },
      { type: 'circle', x: H_OFF_X + 76, y: H_OFF_Y + 92, r: 16 },
      { type: 'circle', x: H_OFF_X + 120, y: H_OFF_Y + 64, r: 14 }
    ],
    hazards: [
      { type: 'sandRect', x: H_OFF_X + 20, y: H_OFF_Y + 52, w: 48, h: 28 },
      { type: 'waterRect', x: H_OFF_X + 144, y: H_OFF_Y + 192, w: 56, h: 40 }
    ]
  },
  {
    id: 5,
    name: 'Mini Maze',
    par: 5,
    ballStart: { x: H_OFF_X + 16, y: H_OFF_Y + 296 },
    cup: { x: H_OFF_X + 184, y: H_OFF_Y + 20 },
    terrain: {
      tee: { x: H_OFF_X + 4, y: H_OFF_Y + 288, w: 24, h: 16, r: 6 },
      fairway: [
        { x: H_OFF_X + 8, y: H_OFF_Y + 260, w: 32, h: 44, r: 16 },
        { x: H_OFF_X + 0, y: H_OFF_Y + 192, w: 36, h: 80, r: 20 },
        { x: H_OFF_X + 28, y: H_OFF_Y + 132, w: 56, h: 72, r: 24 },
        { x: H_OFF_X + 80, y: H_OFF_Y + 72, w: 60, h: 76, r: 24 },
        { x: H_OFF_X + 132, y: H_OFF_Y + 28, w: 56, h: 64, r: 24 }
      ],
      green: { x: H_OFF_X + 160, y: H_OFF_Y + 0, w: 48, h: 48, r: 24 }
    },
    slopes: [
      { cx: 0.28, cy: 0.36, strength: 0.58, dir: 'S' },
      { cx: 0.64, cy: 0.64, strength: 0.34, dir: 'NE' }
    ],
    obstacles: [
      { type: 'rect', x: H_OFF_X + 32, y: H_OFF_Y + 252, w: 128, h: 16 },
      { type: 'rect', x: H_OFF_X + 0, y: H_OFF_Y + 192, w: 120, h: 16 },
      { type: 'rect', x: H_OFF_X + 80, y: H_OFF_Y + 132, w: 120, h: 16 },
      { type: 'rect', x: H_OFF_X + 0, y: H_OFF_Y + 72, w: 128, h: 16 },
      { type: 'circle', x: H_OFF_X + 152, y: H_OFF_Y + 108, r: 14 },
      { type: 'circle', x: H_OFF_X + 52, y: H_OFF_Y + 36, r: 14 }
    ],
    hazards: [
      { type: 'waterRect', x: H_OFF_X + 128, y: H_OFF_Y + 224, w: 72, h: 32 },
      { type: 'waterRect', x: H_OFF_X + 0, y: H_OFF_Y + 96, w: 52, h: 28 },
      { type: 'sandRect', x: H_OFF_X + 140, y: H_OFF_Y + 44, w: 40, h: 28 }
    ]
  }
];

// Michael's Custom Course - imported from Course Designer
const MICHAELS_COURSE_HOLES = [
  {
    "id": 1,
    "name": "Hole 1",
    "par": 4,
    "ballStart": {
      "x": 80.41176470588235,
      "y": 139.2941176470588
    },
    "cup": {
      "x": 322.63114499879214,
      "y": 123.32402645560549
    },
    "terrain": {
      "tee": {
        "x": 70.41176470588235,
        "y": 132.2941176470588,
        "w": 20,
        "h": 14,
        "r": 3
      },
      "fairway": [
        {
          "x": 106.04290970467453,
          "y": 119.26520292619372,
          "w": 88.82352941176471,
          "h": 32.64705882352939,
          "r": 13.058823529411757
        }
      ],
      "green": {
        "x": 302.925262645851,
        "y": 104.50049704384077,
        "w": 40,
        "h": 40,
        "r": 10
      }
    },
    "slopes": [],
    "obstacles": [
      {
        "type": "rect",
        "x": 118.1017332340863,
        "y": 152.50049704384077,
        "w": 19.117647058823522,
        "h": 13.235294117647044
      },
      {
        "type": "rect",
        "x": 104.27820382232159,
        "y": 115.44167351442901,
        "w": 17.352941176470594,
        "h": 14.411764705882362
      },
      {
        "type": "circle",
        "x": 145.4546744105569,
        "y": 159.2652029261937,
        "r": 14,
        "look": "pine"
      },
      {
        "type": "circle",
        "x": 197.51349793996866,
        "y": 126.91226174972313,
        "r": 16,
        "look": "oak"
      },
      {
        "type": "circle",
        "x": 174.5723214693804,
        "y": 107.79461469089959,
        "r": 13,
        "look": "palm"
      },
      {
        "type": "circle",
        "x": 107.51349793996864,
        "y": 156.91226174972311,
        "r": 13,
        "look": "palm"
      },
      {
        "type": "circle",
        "x": 190.4546744105569,
        "y": 164.85343822031135,
        "r": 13,
        "look": "palm"
      },
      {
        "type": "circle",
        "x": 183.39585088114512,
        "y": 171.32402645560546,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 129.5723214693804,
        "y": 177.20637939678193,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 102.21938029290982,
        "y": 177.79461469089958,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 95.7487920576157,
        "y": 153.38284998501723,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 132.21938029290982,
        "y": 110.73579116148784,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 148.68996852820393,
        "y": 108.67696763207607,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 169.86643911643924,
        "y": 108.67696763207607,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 240,
        "y": 185,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 220,
        "y": 185,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 220,
        "y": 205,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 205,
        "y": 205,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 205,
        "y": 195,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 210,
        "y": 180,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 365,
        "y": 190,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 510,
        "y": 0,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 475,
        "y": 50,
        "r": 12,
        "look": "cypress"
      },
      {
        "type": "circle",
        "x": 412.3499807666048,
        "y": 45.10871555167529,
        "r": 12,
        "look": "cypress"
      }
    ],
    "hazards": [
      {
        "type": "sandRect",
        "x": 152.73576587850377,
        "y": 142.13452968825825,
        "w": 28.967228828812093,
        "h": 28.967228828812093
      },
      {
        "type": "waterRect",
        "x": 113.68996852820393,
        "y": 115.73579116148784,
        "w": 92.64705882352942,
        "h": 6.17647058823529
      },
      {
        "type": "waterRect",
        "x": 206.33702735173335,
        "y": 103.08873233795842,
        "w": 7.941176470588232,
        "h": 60.588235294117624
      }
    ]
  },
  {
    "id": 2,
    "name": "Hole 2",
    "par": 5,
    "ballStart": {
      "x": 280,
      "y": 487
    },
    "cup": {
      "x": 319.96386682583443,
      "y": 124.01738941329063
    },
    "terrain": {
      "tee": {
        "x": 270,
        "y": 480,
        "w": 20,
        "h": 14,
        "r": 3
      },
      "fairway": [],
      "green": {
        "x": 302,
        "y": 103,
        "w": 40,
        "h": 40,
        "r": 10
      }
    },
    "slopes": [
      {
        "cx": 0.6986064745674397,
        "cy": 0.6923465000381519,
        "strength": 0.35,
        "dir": "N"
      },
      {
        "cx": 0.20534667064586073,
        "cy": 0.6629347353322658,
        "strength": 0.35,
        "dir": "N"
      }
    ],
    "obstacles": [],
    "hazards": []
  },
  {
    "id": 3,
    "name": "Hole 3",
    "par": 3,
    "ballStart": {
      "x": 320.21386682583443,
      "y": 159.51738941329063
    },
    "cup": {
      "x": 359.96386682583443,
      "y": 383.01738941329063
    },
    "terrain": {
      "tee": {
        "x": 310.21386682583443,
        "y": 152.51738941329063,
        "w": 20,
        "h": 14,
        "r": 3
      },
      "fairway": [
        {
          "x": 218.21386682583443,
          "y": 249.51738941329063,
          "w": 158,
          "h": 21,
          "r": 8.4
        },
        {
          "x": 307.21386682583443,
          "y": 200.51738941329063,
          "w": 28,
          "h": 90,
          "r": 11.200000000000001
        },
        {
          "x": 301.21386682583443,
          "y": 234.51738941329063,
          "w": 73,
          "h": 70,
          "r": 28
        },
        {
          "x": 345.21386682583443,
          "y": 213.51738941329063,
          "w": 29,
          "h": 54,
          "r": 11.600000000000001
        },
        {
          "x": 362.21386682583443,
          "y": 295.51738941329063,
          "w": 6,
          "h": 42,
          "r": 2.4000000000000004
        },
        {
          "x": 303.21386682583443,
          "y": 278.51738941329063,
          "w": 37,
          "h": 61,
          "r": 14.8
        }
      ],
      "green": {
        "x": 340.21386682583443,
        "y": 359.51738941329063,
        "w": 40,
        "h": 40,
        "r": 10
      }
    },
    "slopes": [
      {
        "cx": 0.85,
        "cy": 0.575,
        "strength": 0.98,
        "dir": "E"
      }
    ],
    "obstacles": [
      {
        "type": "rect",
        "x": 274.21386682583443,
        "y": 354.51738941329063,
        "w": 32,
        "h": 70
      },
      {
        "type": "rect",
        "x": 157.21386682583443,
        "y": 351.51738941329063,
        "w": 92,
        "h": 79
      },
      {
        "type": "circle",
        "x": 256.21386682583443,
        "y": 440.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 332.21386682583443,
        "y": 435.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 388.21386682583443,
        "y": 423.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 415.21386682583443,
        "y": 396.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 444.21386682583443,
        "y": 324.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 433.21386682583443,
        "y": 278.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 421.21386682583443,
        "y": 244.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 350.21386682583443,
        "y": 279.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 233.21386682583443,
        "y": 282.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 197.21386682583443,
        "y": 327.51738941329063,
        "r": 10,
        "look": "birch"
      },
      {
        "type": "circle",
        "x": 242.21386682583443,
        "y": 330.51738941329063,
        "r": 10,
        "look": "birch"
      }
    ],
    "hazards": [
      {
        "type": "sandRect",
        "x": 238.16261844630117,
        "y": 256.46614103375737,
        "w": 78.10249675906655,
        "h": 78.10249675906655
      },
      {
        "type": "sandRect",
        "x": 372.86863176597694,
        "y": 284.17215435343314,
        "w": 46.690470119715,
        "h": 46.690470119715
      },
      {
        "type": "sandRect",
        "x": 361.5805591730505,
        "y": 224.8840817605067,
        "w": 43.266615305567875,
        "h": 43.266615305567875
      },
      {
        "type": "sandRect",
        "x": 296.627638377567,
        "y": 175.9311609650232,
        "w": 55.17245689653488,
        "h": 55.17245689653488
      },
      {
        "type": "sandRect",
        "x": 231.96505732902105,
        "y": 205.26857991647725,
        "w": 52.49761899362675,
        "h": 52.49761899362675
      },
      {
        "type": "sandRect",
        "x": 257.19871878739605,
        "y": 300.50224137485225,
        "w": 66.03029607687671,
        "h": 66.03029607687671
      },
      {
        "type": "sandRect",
        "x": 294.21386682583443,
        "y": 345.51738941329063,
        "w": 30,
        "h": 30
      },
      {
        "type": "waterRect",
        "x": 307.21386682583443,
        "y": 332.51738941329063,
        "w": 29,
        "h": 81
      },
      {
        "type": "waterRect",
        "x": 340.21386682583443,
        "y": 328.51738941329063,
        "w": 79,
        "h": 24
      },
      {
        "type": "waterRect",
        "x": 318.21386682583443,
        "y": 327.51738941329063,
        "w": 111,
        "h": 28
      }
    ]
  }
];

const BACKSTORY_PARAGRAPHS = [
  'In the year 2155, humanity reached the stars — and brought golf with them.',
  'But Earth is proud, and conflicted, about its Tour players. Funding is limited. Public support is passionate, but fickle. And there\'s an ongoing cultural debate: should humanity\'s best and brightest be chasing a ball across alien worlds... or solving problems at home?',
  'The last human to reach the final round of The Keldaran Masters — Joaquin Reyes — retired mid-tournament in 2184. Under mysterious circumstances. His Tour file is sealed. His caddie hasn\'t spoken publicly since.',
  'Tensions are rising across the galaxy. A Paxi player named Thresh has accused the Voss Hegemony of engineering their gravity-adapted clubs to exploit a loophole in equipment regulations. The Tour council is investigating.',
  'On Nyx-4 — a dead moon in the Keldaran system — there\'s a decommissioned course. It was removed from Tour certification after three players disappeared during a practice round. Locals say the terrain shifts.',
  'FoldRight, the largest fold-transit corporation, is dangling a record-breaking sponsorship deal. The first human to win a Major this season gets the prize. The catch? Exclusive travel rights. They control where you compete — and when.',
  'The Rill Consortium has never lost The Rill Invitational on home ice. Nobody beats a Rill in the cold. Seven species have tried. The streak is forty-one years running.',
  'Meanwhile, somewhere on Aeris Station, a black-market fabricator claims to possess a prototype putter — forged from compressed neutron-star alloy. Almost certainly illegal. And supposedly... the most precise instrument ever built.',
  'Earth\'s Sol Classic is considered the weakest of the four Majors — at least by alien pundits — who find the single-gravity, oxygen-atmosphere conditions "quaint." Human fans take this personally. The atmosphere at the Sol Classic is the most hostile in professional golf. Not because of the course. Because of the crowd.',
  'Fold-lag — the neurological side effect of repeated space compression — is an open secret on Tour. Long-haul players develop micro-tremors. Depth perception drift. And what caddies call "the yips between stars." There is no official treatment. The Tour does not acknowledge it exists.',
  'Every fifty years, the Neutral Compact allows a provisional course from a non-signatory world to host an exhibition major. The next window opens this season. Three uncontacted civilizations have submitted bids. Nobody knows what their courses look like. Nobody knows what they look like.',
  'Your Tour begins now. Good luck out there, player.'
];

const COURSES = [
  {
    id: 'pine-valley',
    name: 'Pine Valley',
    designer: 'Atlas',
    holes: HOLES,
    description: '5 holes • Par 20',
    difficulty: 'Medium'
  },
  {
    id: 'michaels-course',
    name: "Michael's Course",
    designer: 'Michael',
    holes: MICHAELS_COURSE_HOLES,
    description: '3 holes • Par 12',
    difficulty: 'Hard'
  }
];

const WORLD = { w: 1040, h: 1100 };
const CAMERA_ZOOM = 3.2;
const IS_WEB = Platform.OS === 'web';
const MANUAL_PAN_GRACE_MS = 2200;
const BALL_RADIUS_WORLD = 2.4;
const CUP_RADIUS_WORLD = 2.0;
const SHOT_PAD_SIZE = 184;
const PAD_CENTER = SHOT_PAD_SIZE / 2;
const SHOT_PAD_RADIUS = 78;
const SPIN_DOT_RADIUS = 16;
const MAX_SPIN_OFFSET = SHOT_PAD_RADIUS - SPIN_DOT_RADIUS - 10;
const YARDS_PER_WORLD = 1.3;
const AIM_DOT_STEP_WORLD = 3.6;
const PREVIEW_FRICTION = 2.1;
const STOP_SPEED = 6;
const GRAVITY = 30;
const GROUND_EPSILON = 0.05;
const FRINGE_BUFFER = 8;
const MIN_BOUNCE_VZ = 3.2;
const CURVE_FORCE = 0.12;
const CURVE_LAUNCH_BLEND = 0.3;

// Haptic feedback: vibrate on Android/Chrome, audio tick on iOS Safari
const hapticBuzz = (pattern = 30) => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(typeof pattern === 'number' ? pattern : pattern);
    return;
  }
  // Fallback: short audio tick via Web Audio API
  try {
    const ctx = window.__hapticAudioCtx || (window.__hapticAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 220;
    gain.gain.value = 0.15;
    osc.start();
    const dur = typeof pattern === 'number' ? pattern / 1000 : 0.03;
    osc.stop(ctx.currentTime + dur);
  } catch (e) { /* silent */ }
};
const hapticDoubleTap = () => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([20, 60, 20]);
    return;
  }
  try {
    const ctx = window.__hapticAudioCtx || (window.__hapticAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === 'suspended') ctx.resume();
    const playTick = (delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 330;
      gain.gain.value = 0.15;
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.02);
    };
    playTick(0);
    playTick(0.08);
  } catch (e) { /* silent */ }
};
const PUTTING_ZOOM_MULT = 1.8;
const SLOPE_FORCE = 5.0;
const PUTT_PREVIEW_DT = 1 / 120;
const PUTT_PREVIEW_MAX_TICKS = 1400;
const PUTT_PREVIEW_SAMPLE_TICKS = 8;
const CLUBS = [
  { key: 'PT', name: 'Putter', short: 'PT', speed: 0.16, launch: 0.03, roll: 0.95, spin: 1.22, carryYards: 40 },
  { key: 'LW', name: 'Lob Wedge', short: 'LW', speed: 0.44, launch: 1.18, roll: 0.52, spin: 0.82, carryYards: 70 },
  { key: 'SW', name: 'Sand Wedge', short: 'SW', speed: 0.5, launch: 1.08, roll: 0.56, spin: 0.85, carryYards: 80 },
  { key: 'GW', name: 'Gap Wedge', short: 'GW', speed: 0.56, launch: 0.98, roll: 0.6, spin: 0.9, carryYards: 90 },
  { key: 'PW', name: 'Pitching Wedge', short: 'PW', speed: 0.64, launch: 0.9, roll: 0.66, spin: 0.93, carryYards: 105 },
  { key: '9I', name: '9 Iron', short: '9i', speed: 0.72, launch: 0.82, roll: 0.72, spin: 0.97, carryYards: 120 },
  { key: '8I', name: '8 Iron', short: '8i', speed: 0.8, launch: 0.76, roll: 0.78, spin: 1, carryYards: 130 },
  { key: '7I', name: '7 Iron', short: '7i', speed: 0.88, launch: 0.7, roll: 0.84, spin: 1.02, carryYards: 140 },
  { key: '6I', name: '6 Iron', short: '6i', speed: 0.96, launch: 0.65, roll: 0.9, spin: 1.04, carryYards: 150 },
  { key: '5I', name: '5 Iron', short: '5i', speed: 1.04, launch: 0.6, roll: 0.96, spin: 1.06, carryYards: 160 },
  { key: '4I', name: '4 Iron', short: '4i', speed: 1.12, launch: 0.56, roll: 1.02, spin: 1.08, carryYards: 170 },
  { key: '3I', name: '3 Iron', short: '3i', speed: 1.18, launch: 0.52, roll: 1.06, spin: 1.1, carryYards: 180 },
  { key: '7W', name: '7 Wood', short: '7w', speed: 1.08, launch: 0.62, roll: 0.98, spin: 1, carryYards: 190 },
  { key: '5W', name: '5 Wood', short: '5w', speed: 1.18, launch: 0.57, roll: 1.04, spin: 0.98, carryYards: 210 },
  { key: '3W', name: '3 Wood', short: '3w', speed: 1.3, launch: 0.5, roll: 1.1, spin: 0.96, carryYards: 225 },
  { key: 'DR', name: 'Driver', short: 'DR', speed: 1.46, launch: 0.46, roll: 1.16, spin: 0.92, carryYards: 250 }
];

// ═══════════════ GOLFER PROFILES ═══════════════
const GOLFERS = [
  {
    id: 'mike_g',
    name: 'Mike G',
    species: 'Human',
    origin: 'Earth — Sol System',
    bio: 'A steady, well-rounded player from Earth\'s qualifying circuit. No standout weakness, no standout strength — just solid golf.',
    avatar: {
      skin: '#f0c08c', hat: '#263246', shirt: '#3f76c1', pants: '#2e563c'
    },
    stats: {
      power: 50,
      accuracy: 50,
      touch: 50,
      spinControl: 50,
      putting: 50,
      recovery: 50
    },
    mental: {
      focus: 50,
      composure: 50,
      courseManagement: 50
    }
  }
];

// ═══════════════ EQUIPMENT CATALOG ═══════════════
// Each club item has stats that modify gameplay. "Generic" brand = starter gear.
// Categories: drivers, fairwayWoods, hybrids, irons, wedges, putters
const EQUIPMENT_CATALOG = {
  drivers: [
    { id: 'generic_dr', name: 'Generic Driver', brand: 'Generic', clubKey: 'DR',
      stats: { distance: 50, accuracy: 50, forgiveness: 50, spin: 50 } }
  ],
  fairwayWoods: [
    { id: 'generic_3w', name: 'Generic 3 Wood', brand: 'Generic', clubKey: '3W',
      stats: { distance: 50, accuracy: 50, forgiveness: 50, spin: 50 } },
    { id: 'generic_5w', name: 'Generic 5 Wood', brand: 'Generic', clubKey: '5W',
      stats: { distance: 50, accuracy: 50, forgiveness: 50, spin: 50 } },
    { id: 'generic_7w', name: 'Generic 7 Wood', brand: 'Generic', clubKey: '7W',
      stats: { distance: 50, accuracy: 50, forgiveness: 50, spin: 50 } }
  ],
  irons: [
    { id: 'generic_3i', name: 'Generic 3 Iron', brand: 'Generic', clubKey: '3I',
      stats: { distance: 50, accuracy: 50, forgiveness: 40, spin: 50 } },
    { id: 'generic_4i', name: 'Generic 4 Iron', brand: 'Generic', clubKey: '4I',
      stats: { distance: 50, accuracy: 50, forgiveness: 42, spin: 50 } },
    { id: 'generic_5i', name: 'Generic 5 Iron', brand: 'Generic', clubKey: '5I',
      stats: { distance: 50, accuracy: 50, forgiveness: 45, spin: 50 } },
    { id: 'generic_6i', name: 'Generic 6 Iron', brand: 'Generic', clubKey: '6I',
      stats: { distance: 50, accuracy: 50, forgiveness: 48, spin: 50 } },
    { id: 'generic_7i', name: 'Generic 7 Iron', brand: 'Generic', clubKey: '7I',
      stats: { distance: 50, accuracy: 50, forgiveness: 52, spin: 50 } },
    { id: 'generic_8i', name: 'Generic 8 Iron', brand: 'Generic', clubKey: '8I',
      stats: { distance: 50, accuracy: 50, forgiveness: 55, spin: 50 } },
    { id: 'generic_9i', name: 'Generic 9 Iron', brand: 'Generic', clubKey: '9I',
      stats: { distance: 50, accuracy: 50, forgiveness: 58, spin: 50 } }
  ],
  wedges: [
    { id: 'generic_pw', name: 'Generic Pitching Wedge', brand: 'Generic', clubKey: 'PW',
      stats: { distance: 50, accuracy: 50, forgiveness: 55, spin: 55 } },
    { id: 'generic_gw', name: 'Generic Gap Wedge', brand: 'Generic', clubKey: 'GW',
      stats: { distance: 50, accuracy: 50, forgiveness: 52, spin: 58 } },
    { id: 'generic_sw', name: 'Generic Sand Wedge', brand: 'Generic', clubKey: 'SW',
      stats: { distance: 50, accuracy: 50, forgiveness: 50, spin: 62 } },
    { id: 'generic_lw', name: 'Generic Lob Wedge', brand: 'Generic', clubKey: 'LW',
      stats: { distance: 50, accuracy: 45, forgiveness: 45, spin: 65 } }
  ],
  putters: [
    { id: 'generic_pt', name: 'Generic Putter', brand: 'Generic', clubKey: 'PT',
      stats: { distance: 50, accuracy: 50, forgiveness: 50, feel: 50 } }
  ]
};

// Default bag: 14 clubs (DR, 3W, 5W, 4I-9I, PW, GW, SW, LW, PT)
const DEFAULT_BAG = [
  'generic_dr', 'generic_3w', 'generic_5w',
  'generic_4i', 'generic_5i', 'generic_6i', 'generic_7i', 'generic_8i', 'generic_9i',
  'generic_pw', 'generic_gw', 'generic_sw', 'generic_lw',
  'generic_pt'
];

const getAllEquipment = () => {
  const all = [];
  Object.values(EQUIPMENT_CATALOG).forEach(category => category.forEach(item => all.push(item)));
  return all;
};

const getEquipmentById = (id) => getAllEquipment().find(e => e.id === id);

const SURFACE_PHYSICS = {
  // powerPenalty: [min, max] for random range per shot. swingSensitivity: multiplier on swing deviation (1.0 = normal)
  rough: { rollFriction: 4.2, bounce: 0.18, landingDamping: 0.72, wallRestitution: 0.62, powerPenalty: [0.8, 0.9], swingSensitivity: 1.4, label: 'Rough', emoji: '🌿', color: '#3a6b2a' },
  deepRough: { rollFriction: 5.8, bounce: 0.12, landingDamping: 0.6, wallRestitution: 0.55, powerPenalty: [0.65, 0.75], swingSensitivity: 1.8, label: 'Deep Rough', emoji: '🌾', color: '#2d5420' },
  secondCut: { rollFriction: 3.8, bounce: 0.2, landingDamping: 0.76, wallRestitution: 0.63, powerPenalty: [0.88, 0.92], swingSensitivity: 1.2, label: 'Second Cut', emoji: '🌱', color: '#4a8535' },
  fairway: { rollFriction: 3.3, bounce: 0.24, landingDamping: 0.8, wallRestitution: 0.66, powerPenalty: [0.95, 0.95], swingSensitivity: 1.0, label: 'Fairway', emoji: '🏌️', color: '#5aad42' },
  fringe: { rollFriction: 3.8, bounce: 0.2, landingDamping: 0.76, wallRestitution: 0.64, powerPenalty: [0.95, 0.95], swingSensitivity: 1.1, label: 'Fringe', emoji: '🟢', color: '#4d9940' },
  sand: { rollFriction: 6.5, bounce: 0.1, landingDamping: 0.54, wallRestitution: 0.52, powerPenalty: [0.6, 0.65], swingSensitivity: 2.0, label: 'Bunker', emoji: '⛱️', color: '#d4b96a' },
  pluggedSand: { rollFriction: 8.0, bounce: 0.05, landingDamping: 0.4, wallRestitution: 0.4, powerPenalty: [0.35, 0.45], swingSensitivity: 2.4, label: 'Plugged Lie', emoji: '🥚', color: '#c9a84e' },
  green: { rollFriction: 2.6, bounce: 0.14, landingDamping: 0.82, wallRestitution: 0.68, powerPenalty: [1.0, 1.0], swingSensitivity: 1.0, label: 'Green', emoji: '⛳', color: '#3dba4a' },
  tee: { rollFriction: 3.0, bounce: 0.22, landingDamping: 0.85, wallRestitution: 0.7, powerPenalty: [1.0, 1.0], swingSensitivity: 1.0, label: 'Tee Box', emoji: '🏌️', color: '#5aad42' }
};

const GOLFER_PIXEL_KEY = {
  h: '#d25f49',
  o: '#20282a',
  s: '#3f76c1',
  k: '#f0c08c',
  p: '#2e563c',
  b: '#1a1f1c',
  c: '#d9ddd2',
  n: '#263246',
  w: '#edf1ea'
};

const GOLFER_SPRITE_ROWS = [
  '.....nn.....',
  '....nwwn....',
  '...nkkkkn...',
  '..nnssssnn..',
  '..nsshhssn..',
  '.ppsssssspp.',
  '.ppsskksspp.',
  '..pppppppp..',
  '..bb....bb..',
  '.bb......bb.',
  '.b........b.'
];

const GOLFER_PIXELS = GOLFER_SPRITE_ROWS.flatMap((row, y) =>
  row.split('').flatMap((token, x) => (token === '.' ? [] : [{ x, y, color: GOLFER_PIXEL_KEY[token] }]))
);
const WIND_DIRS = {
  N:  { x: 0, y: -1 },  S:  { x: 0, y: 1 },
  E:  { x: 1, y: 0 },   W:  { x: -1, y: 0 },
  NE: { x: 0.707, y: -0.707 }, NW: { x: -0.707, y: -0.707 },
  SE: { x: 0.707, y: 0.707 },  SW: { x: -0.707, y: 0.707 }
};
const WIND_ARROWS = { N: '↑', S: '↓', E: '→', W: '←', NE: '↗', NW: '↖', SE: '↘', SW: '↙' };
const WIND_DIR_KEYS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const generateWind = (holes = HOLES) => {
  // One random speed for the whole round (1-25 mph), direction shifts per hole
  const roundSpeed = Math.max(1, Math.round(Math.random() * 25));
  return holes.map(() => {
    const dir = WIND_DIR_KEYS[Math.floor(Math.random() * WIND_DIR_KEYS.length)];
    return { speed: roundSpeed, dir };
  });
};
const WIND_FORCE_SCALE = 0.35;
const SHOT_SHAPE_HINTS = {
  PT: 'Low roll',
  LW: 'High soft',
  SW: 'High check',
  GW: 'Mid check',
  PW: 'Mid flight',
  '9I': 'Mid draw',
  '8I': 'Piercing',
  '7I': 'Piercing',
  '6I': 'Strong draw',
  '5I': 'Strong draw',
  '4I': 'Low runner',
  '3I': 'Stinger',
  '7W': 'High carry',
  '5W': 'Long carry',
  '3W': 'Penetrating',
  DR: 'Power fade'
};
const BUILD_VERSION = 'IGT v3.1';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const degToRad = (deg) => (deg * Math.PI) / 180;

const magnitude = (v) => Math.hypot(v.x, v.y);

const normalize = (v) => {
  const m = magnitude(v);
  if (m < 0.0001) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / m, y: v.y / m };
};

const pointInRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

const pointInCircle = (p, c) => {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return dx * dx + dy * dy <= c.r * c.r;
};

const getAimAngleToCup = (ballPos, cup) => Math.atan2(cup.y - ballPos.y, cup.x - ballPos.x);
const speedFromPower = (powerPct, club = CLUBS[0]) => {
  const powerFrac = clamp(powerPct / 100, 0, 1.2);
  const targetCarryWorld = (club.carryYards / YARDS_PER_WORLD) * powerFrac;
  // Hang time must match strikeBall: (3.2 + launch * 0.8) * launchRatio
  const launchRatio = clamp(powerPct / 125, 0, 1);
  const hangTime = (3.2 + club.launch * 0.8) * launchRatio;
  const expFactor = 1 - Math.exp(-0.14 * hangTime);
  return expFactor > 0.001 ? (targetCarryWorld * 0.14 / expFactor) : targetCarryWorld * 2;
};
const expandRect = (rect, inset) => ({
  x: rect.x - inset,
  y: rect.y - inset,
  w: rect.w + inset * 2,
  h: rect.h + inset * 2
});
const getSurfaceAtPoint = (hole, point) => {
  const inSand = hole.hazards?.some((h) => h.type === 'sandRect' && pointInRect(point, h));
  if (inSand) return 'sand';
  const terrain = hole.terrain;
  if (terrain?.tee && pointInRect(point, terrain.tee)) return 'tee';
  if (terrain?.green && pointInRect(point, terrain.green)) return 'green';
  if (terrain?.green && pointInRect(point, expandRect(terrain.green, FRINGE_BUFFER))) return 'fringe';
  if (terrain?.fairway?.some((f) => pointInRect(point, f))) return 'fairway';
  if (terrain?.fairway?.some((f) => pointInRect(point, expandRect(f, 12)))) return 'secondCut';
  const nearAnything = terrain?.fairway?.some((f) => pointInRect(point, expandRect(f, 30)));
  if (!nearAnything) return 'deepRough';
  return 'rough';
};
const estimateStraightDistance = (powerPct, club, strike = { launch: 1, spin: 1 }) => {
  const shotRatio = clamp(powerPct / 100, 0, 1.2);
  return (club.carryYards * shotRatio * strike.launch) / YARDS_PER_WORLD;
};
const puttPowerForDistance = (distanceWorld) => {
  // On a flat green, total roll distance ≈ v0 / friction (geometric drag series)
  // So v0_needed = distance * friction. Then launchRatio = v0 / basePuttSpeed.
  const greenFriction = SURFACE_PHYSICS.green.rollFriction; // 2.6
  const basePuttSpeed = (CLUBS[0].carryYards / YARDS_PER_WORLD) * 2.8;
  const v0Needed = distanceWorld * greenFriction * 1.04; // 4% overshoot corrects discrete sim gap
  const launchRatio = basePuttSpeed > 0 ? v0Needed / basePuttSpeed : 0;
  return clamp(Math.round(clamp(launchRatio, 0, 1) * 125), 5, 125);
};
const getSlopeDirectionUnit = (dir) => {
  const parsed = WIND_DIRS[dir] || { x: 0, y: 0 };
  return normalize(parsed);
};
const getGreenSlopeForce = (hole, point, surfaceName) => {
  if (surfaceName !== 'green' && surfaceName !== 'fringe') {
    return { x: 0, y: 0 };
  }
  const green = hole.terrain?.green;
  if (!green || !hole.slopes?.length) {
    return { x: 0, y: 0 };
  }
  let ax = 0;
  let ay = 0;
  hole.slopes.forEach((slope) => {
    const centerX = green.x + green.w * clamp(slope.cx ?? 0.5, 0, 1);
    const centerY = green.y + green.h * clamp(slope.cy ?? 0.5, 0, 1);
    const nx = (point.x - centerX) / Math.max(1, green.w * 0.8);
    const ny = (point.y - centerY) / Math.max(1, green.h * 0.8);
    const influence = clamp(1 - Math.hypot(nx, ny), 0, 1);
    if (influence <= 0) {
      return;
    }
    const dir = getSlopeDirectionUnit(slope.dir);
    const strength = clamp(slope.strength ?? 0, 0, 1);
    ax += dir.x * strength * influence;
    ay += dir.y * strength * influence;
  });
  return { x: ax * SLOPE_FORCE, y: ay * SLOPE_FORCE };
};

function useScreenSize() {
  const getSize = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return { width: window.innerWidth || 375, height: window.innerHeight || 667 };
    }
    const d = Dimensions.get('window');
    return { width: d.width || 375, height: d.height || 667 };
  };
  const [size, setSize] = useState(getSize);
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handler = () => setSize({ width: window.innerWidth || 375, height: window.innerHeight || 667 });
      window.addEventListener('resize', handler);
      return () => window.removeEventListener('resize', handler);
    }
    const sub = Dimensions.addEventListener('change', ({ window: w }) => setSize({ width: w.width || 375, height: w.height || 667 }));
    return () => sub?.remove?.();
  }, []);
  return size;
}

export default function App() {
  const { width: screenWidth, height: screenHeight } = useScreenSize();
  const viewWidth = Math.max(screenWidth, 320);
  const viewHeight = Math.max(screenHeight, 568);
  const starField = useMemo(() => {
    const colors = ['#FFFFFF', '#A2D2FF', '#FFC0CB'];
    return Array.from({ length: 72 }, (_, i) => ({
      key: `star-${i}`,
      left: Math.random() * viewWidth,
      top: Math.random() * viewHeight,
      size: 1 + Math.random() * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 0.3 + Math.random() * 0.5
    }));
  }, [viewWidth, viewHeight]);
  const [gameScreen, setGameScreen] = useState('menu'); // 'menu' | 'golfer-select' | 'club-select' | 'courses' | 'playing'
  const [selectedGolfer, setSelectedGolfer] = useState(GOLFERS[0]);
  const [selectedBag, setSelectedBag] = useState([...DEFAULT_BAG]);
  const [bagPickerCategory, setBagPickerCategory] = useState('drivers');
  const [activeCourseIndex, setActiveCourseIndex] = useState(0);
  const [selectedCourseIndex, setSelectedCourseIndex] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechPaused, setSpeechPaused] = useState(false);
  const [speechParagraph, setSpeechParagraph] = useState(0);
  const ACTIVE_HOLES = COURSES[activeCourseIndex]?.holes || HOLES;
  const [puttingMode, setPuttingMode] = useState(false);
  const [puttPreview, setPuttPreview] = useState(null);
  const [puttAimPoint, setPuttAimPoint] = useState(null);
  const [puttSimulated, setPuttSimulated] = useState(false);
  const [puttTargetPowerPct, setPuttTargetPowerPct] = useState(null);
  const [puttSwingFeedback, setPuttSwingFeedback] = useState('');
  const basePixelsPerWorld = Math.max(viewWidth / WORLD.w, viewHeight / WORLD.h);
  const cameraZoom = CAMERA_ZOOM * (puttingMode ? PUTTING_ZOOM_MULT : 1);
  const pixelsPerWorld = basePixelsPerWorld * cameraZoom;
  const halfVpW = (viewWidth / 2) / pixelsPerWorld;
  const halfVpH = (viewHeight / 2) / pixelsPerWorld;

  const [holeIndex, setHoleIndex] = useState(0);
  const [strokesCurrent, setStrokesCurrent] = useState(0);
  const [scores, setScores] = useState(Array(ACTIVE_HOLES.length).fill(null));
  const [holeScores, setHoleScores] = useState([]); // array of {hole: number, par: number, strokes: number, name: string}
  const [showScorecard, setShowScorecard] = useState(false);
  const [roundWind, setRoundWind] = useState(() => generateWind(ACTIVE_HOLES));
  const [ball, setBall] = useState(ACTIVE_HOLES[0].ballStart);
  const [aimAngle, setAimAngle] = useState(getAimAngleToCup(ACTIVE_HOLES[0].ballStart, ACTIVE_HOLES[0].cup));
  const [isAiming, setIsAiming] = useState(false);
  const [sunk, setSunk] = useState(false);
  const [waterNotice, setWaterNotice] = useState(false);
  const [waterDropMenu, setWaterDropMenu] = useState(null); // null or { lastPos, entryPos, hazard }
  const lastShotPosRef = useRef(null); // position before current shot (for stroke & distance)
  const [shotControlOpen, setShotControlOpen] = useState(false);
  const [spinOffset, setSpinOffset] = useState({ x: 0, y: 0 });
  const [powerPct, setPowerPct] = useState(0);
  const powerRef = useRef(0);
  const [swingPhase, setSwingPhase] = useState('idle'); // idle | backswing | forward
  const [swingDeviation, setSwingDeviation] = useState(0); // -1 to 1, how far off center on forward swing
  const swingDeviationRef = useRef(0);
  const swingStartRef = useRef({ x: 0, y: 0 });
  const swingLowestRef = useRef({ x: 0, y: 0 });
  const swingTrailRef = useRef([]); // [{x,y}] trail of forward swing path
  const fullSwingPathRef = useRef([]); // entire drag path for visualization
  const peakPowerRef = useRef(0); // max power reached during backswing
  const backDeviationRef = useRef(0); // backswing L/R deviation (-1 to 1)
  const transitionTimeRef = useRef(0); // timestamp when backswing locked into forward swing
  const backswingStartTimeRef = useRef(0); // timestamp when backswing began
  const shotTracerRef = useRef([]); // world positions for shot tracer
  const [shotTracer, setShotTracer] = useState([]);
  const swingLockedRef = useRef(false); // true once forward swing starts
  const [lastShotStats, setLastShotStats] = useState(null);
  const [showShotStats, setShowShotStats] = useState(false);
  const shotStartPosRef = useRef(null);
  const shotLandPosRef = useRef(null);
  const shotPeakHeightRef = useRef(0);
  const shotCarryRef = useRef(0);
  const shotRollRef = useRef(0);
  const shotCurveDegRef = useRef(0);
  const shotAimAngleRef = useRef(getAimAngleToCup(ACTIVE_HOLES[0].ballStart, ACTIVE_HOLES[0].cup));
  const [currentLie, setCurrentLie] = useState('tee');
  const [selectedClubIndex, setSelectedClubIndex] = useState(15);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clubPickerOpen, setClubPickerOpen] = useState(false);
  const [lastShotNote, setLastShotNote] = useState('Tap Yards to shape the shot, then tap the big ball to strike it.');
  const [tempoLabel, setTempoLabel] = useState('Blue dot centered');
  const [golferBallAnchor, setGolferBallAnchor] = useState(ACTIVE_HOLES[0].ballStart);
  const [ballHeight, setBallHeight] = useState(0);
  const [camera, setCamera] = useState({ x: ACTIVE_HOLES[0].ballStart.x, y: ACTIVE_HOLES[0].ballStart.y });
  const cameraRef = useRef({ x: ACTIVE_HOLES[0].ballStart.x, y: ACTIVE_HOLES[0].ballStart.y });
  const clampCameraRef = useRef((c) => c);
  const manualPanUntilRef = useRef(0);
  const panCentroidRef = useRef(null);
  const isTwoFingerPanningRef = useRef(false);
  const webPanStartCameraRef = useRef(null);

  const ballRef = useRef(ball);
  const velocityRef = useRef({ x: 0, y: 0 });
  const flightRef = useRef({ z: 0, vz: 0 });
  const lastTsRef = useRef(null);
  const frameRef = useRef(null);
  const courseRef = useRef(null);
  const courseFrameRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const sunkRef = useRef(false);
  const holeIndexRef = useRef(0);
  const roundWindRef = useRef(roundWind);
  const [draggingSpinDot, setDraggingSpinDot] = useState(false);

  const safeHoleIndex = clamp(holeIndex, 0, Math.max(0, ACTIVE_HOLES.length - 1));
  const currentHole = ACTIVE_HOLES[safeHoleIndex] || ACTIVE_HOLES[0];
  const selectedClub = CLUBS[selectedClubIndex];
  const scaleX = pixelsPerWorld;
  const scaleY = pixelsPerWorld;
  const ballRadius = clamp(BALL_RADIUS_WORLD * pixelsPerWorld * 0.48 * 0.6, 3, 10);
  const cupRadius = clamp(CUP_RADIUS_WORLD * pixelsPerWorld * 0.32, 6, 14);
  const clampCamera = (c) => ({
    x: clamp(c.x, halfVpW, WORLD.w - halfVpW),
    y: clamp(c.y, halfVpH, WORLD.h - halfVpH)
  });
  clampCameraRef.current = clampCamera;
  const ballMoving =
    magnitude(velocityRef.current) > 0.3 ||
    flightRef.current.z > 0.04 ||
    Math.abs(flightRef.current.vz) > 0.35;

  const syncCourseFrame = () => {
    if (!courseRef.current || typeof courseRef.current.measureInWindow !== 'function') {
      return;
    }
    courseRef.current.measureInWindow((x, y, width, height) => {
      courseFrameRef.current = { x, y, width, height };
    });
  };

  const toScreen = (p) => ({
    x: (p.x - cameraRef.current.x) * pixelsPerWorld + viewWidth / 2,
    y: (p.y - cameraRef.current.y) * pixelsPerWorld + viewHeight / 2
  });
  const toWorld = (p) => ({
    x: cameraRef.current.x + (p.x - viewWidth / 2) / pixelsPerWorld,
    y: cameraRef.current.y + (p.y - viewHeight / 2) / pixelsPerWorld
  });

  const resetBall = ({ penaltyStroke = false } = {}) => {
    velocityRef.current = { x: 0, y: 0 };
    flightRef.current = { z: 0, vz: 0 };
    setBallHeight(0);
    setBall(currentHole.ballStart);
    setAimAngle(getAimAngleToCup(currentHole.ballStart, currentHole.cup));
    setIsAiming(false);
    setShotControlOpen(false);
    setSpinOffset({ x: 0, y: 0 });
    setPuttingMode(false);
    setPuttPreview(null);
    setPuttAimPoint(null);
    setPuttSimulated(false);
    setPuttTargetPowerPct(null);
    setPuttSwingFeedback('');
    powerRef.current = 0; setPowerPct(0);
    shotCurveDegRef.current = 0;
    shotAimAngleRef.current = getAimAngleToCup(currentHole.ballStart, currentHole.cup);
    setTempoLabel('Blue dot centered');
    const nc = clampCamera(currentHole.ballStart);
    setCamera(nc);
    cameraRef.current = nc;
    manualPanUntilRef.current = 0;
    if (penaltyStroke) {
      setStrokesCurrent((s) => s + 1);
      setWaterNotice(true);
    }
  };

  const retryHole = () => {
    setSunk(false);
    setShowScorecard(false);
    setWaterNotice(false);
    setWaterDropMenu(null);
    setStrokesCurrent(0);
    setScores((prev) => {
      const next = [...prev];
      next[holeIndex] = null;
      return next;
    });
    setHoleScores((prev) => prev.filter((entry) => entry.hole !== holeIndex + 1));
    velocityRef.current = { x: 0, y: 0 };
    flightRef.current = { z: 0, vz: 0 };
    setBallHeight(0);
    setBall(currentHole.ballStart);
    setAimAngle(getAimAngleToCup(currentHole.ballStart, currentHole.cup));
    setIsAiming(false);
    setShotControlOpen(false);
    setSpinOffset({ x: 0, y: 0 });
    setPuttingMode(false);
    setPuttPreview(null);
    setPuttAimPoint(null);
    setPuttSimulated(false);
    setPuttTargetPowerPct(null);
    setPuttSwingFeedback('');
    powerRef.current = 0; setPowerPct(0);
    shotCurveDegRef.current = 0;
    shotAimAngleRef.current = getAimAngleToCup(currentHole.ballStart, currentHole.cup);
    setTempoLabel('Blue dot centered');
    setLastShotNote('Tap Yards to shape the shot, then tap the big ball to strike it.');
    const nc = clampCamera(currentHole.ballStart);
    setCamera(nc);
    cameraRef.current = nc;
    manualPanUntilRef.current = 0;
  };

  const goToNextHole = () => {
    if (isLastHole) {
      return;
    }
    setShowScorecard(false);
    setHoleIndex((h) => h + 1);
  };

  const startNewRound = () => {
    setShowScorecard(false);
    setHoleScores([]);
    setScores(Array(ACTIVE_HOLES.length).fill(null));
    setRoundWind(generateWind(ACTIVE_HOLES));
    setHoleIndex(0);
  };

  const startCourse = (courseIndex) => {
    const holes = COURSES[courseIndex]?.holes || HOLES;
    const firstHole = holes[0];
    const firstBall = firstHole?.ballStart || { x: WORLD.w / 2, y: WORLD.h / 2 };
    const firstCup = firstHole?.cup || firstBall;
    const startCamera = {
      x: clamp(firstBall.x, halfVpW, WORLD.w - halfVpW),
      y: clamp(firstBall.y, halfVpH, WORLD.h - halfVpH)
    };

    setActiveCourseIndex(courseIndex);
    setGameScreen('playing');
    setMenuOpen(false);
    setClubPickerOpen(false);
    setHoleIndex(0);
    setStrokesCurrent(0);
    setScores(Array(holes.length).fill(null));
    setHoleScores([]);
    setShowScorecard(false);
    setRoundWind(generateWind(holes));
    setSunk(false);
    setWaterNotice(false);
    setShotControlOpen(false);
    setSpinOffset({ x: 0, y: 0 });
    setPuttingMode(false);
    setPuttPreview(null);
    setPuttAimPoint(null);
    setPuttSimulated(false);
    setPuttTargetPowerPct(null);
    setPuttSwingFeedback('');
    powerRef.current = 0;
    setPowerPct(0);
    shotCurveDegRef.current = 0;
    shotAimAngleRef.current = getAimAngleToCup(firstBall, firstCup);
    setAimAngle(getAimAngleToCup(firstBall, firstCup));
    setBall(firstBall);
    ballRef.current = firstBall;
    setGolferBallAnchor(firstBall);
    velocityRef.current = { x: 0, y: 0 };
    flightRef.current = { z: 0, vz: 0 };
    setBallHeight(0);
    setCurrentLie('tee');
    setTempoLabel('Blue dot centered');
    setLastShotNote('Tap Yards to shape the shot, then tap the big ball to strike it.');
    setCamera(startCamera);
    cameraRef.current = startCamera;
    manualPanUntilRef.current = 0;
  };

  // Water drop options
  const handleWaterDrop = (dropPos) => {
    setWaterDropMenu(null);
    setWaterNotice(false);
    velocityRef.current = { x: 0, y: 0 };
    flightRef.current = { z: 0, vz: 0 };
    setBallHeight(0);
    setBall(dropPos);
    ballRef.current = dropPos;
    setGolferBallAnchor(dropPos);
    setAimAngle(getAimAngleToCup(dropPos, currentHole.cup));
    shotAimAngleRef.current = getAimAngleToCup(dropPos, currentHole.cup);
    setIsAiming(false);
    setShotControlOpen(false);
    setSpinOffset({ x: 0, y: 0 });
    setPuttingMode(false);
    setPuttPreview(null);
    setPuttAimPoint(null);
    setPuttSimulated(false);
    setPuttTargetPowerPct(null);
    setPuttSwingFeedback('');
    powerRef.current = 0;
    setPowerPct(0);
    shotCurveDegRef.current = 0;
    setTempoLabel('Blue dot centered');
    setCurrentLie(getSurfaceAtPoint(currentHole, dropPos));
    const nc = clampCamera(dropPos);
    setCamera(nc);
    cameraRef.current = nc;
    manualPanUntilRef.current = 0;
    // Auto-select club for drop distance
    const distYards = Math.hypot(currentHole.cup.x - dropPos.x, currentHole.cup.y - dropPos.y) * YARDS_PER_WORLD;
    let bestIdx = CLUBS.length - 1;
    let bestDiff = Infinity;
    for (let i = 1; i < CLUBS.length; i++) {
      const diff = Math.abs(CLUBS[i].carryYards - distYards);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    }
    setSelectedClubIndex(bestIdx);
  };

  const backToMenu = () => {
    setGameScreen('menu');
    setMenuOpen(false);
    setShowScorecard(false);
    setHoleIndex(0);
    setScores(Array(ACTIVE_HOLES.length).fill(null));
    setHoleScores([]);
  };

  useEffect(() => { ballRef.current = ball; }, [ball]);
  useEffect(() => { cameraRef.current = camera; }, [camera]);
  useEffect(() => { sunkRef.current = sunk; }, [sunk]);
  useEffect(() => { holeIndexRef.current = safeHoleIndex; }, [safeHoleIndex]);
  useEffect(() => { roundWindRef.current = roundWind; }, [roundWind]);
  useEffect(() => { setSelectedCourseIndex(activeCourseIndex); }, [activeCourseIndex]);

  useEffect(() => {
    if (ballMoving) {
      return;
    }
    setGolferBallAnchor((prev) => {
      const dx = prev.x - ball.x;
      const dy = prev.y - ball.y;
      if (Math.hypot(dx, dy) < 0.05) {
        return prev;
      }
      return ball;
    });
  }, [ball, ballMoving]);

  useEffect(() => {
    setSunk(false);
    setShowScorecard(false);
    setWaterNotice(false);
    setWaterDropMenu(null);
    setStrokesCurrent(0);
    velocityRef.current = { x: 0, y: 0 };
    flightRef.current = { z: 0, vz: 0 };
    setBallHeight(0);
    setBall(currentHole.ballStart);
    setAimAngle(getAimAngleToCup(currentHole.ballStart, currentHole.cup));
    setIsAiming(false);
    setShotControlOpen(false);
    setSpinOffset({ x: 0, y: 0 });
    setPuttingMode(false);
    setPuttPreview(null);
    setPuttAimPoint(null);
    setPuttSimulated(false);
    setPuttTargetPowerPct(null);
    setPuttSwingFeedback('');
    powerRef.current = 0; setPowerPct(0);
    shotCurveDegRef.current = 0;
    shotAimAngleRef.current = getAimAngleToCup(currentHole.ballStart, currentHole.cup);
    setTempoLabel('Blue dot centered');
    setLastShotNote('Tap Yards to shape the shot, then tap the big ball to strike it.');
    // Auto-select club based on par and distance
    const holeDistYards = Math.hypot(currentHole.cup.x - currentHole.ballStart.x, currentHole.cup.y - currentHole.ballStart.y) * YARDS_PER_WORLD;
    if (currentHole.par >= 4) {
      setSelectedClubIndex(CLUBS.length - 1); // Driver
    } else {
      // Par 3: find club closest to hole distance
      let bestIdx = CLUBS.length - 1;
      let bestDiff = Infinity;
      for (let i = 1; i < CLUBS.length; i++) { // skip putter
        const diff = Math.abs(CLUBS[i].carryYards - holeDistYards);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      }
      setSelectedClubIndex(bestIdx);
    }
  }, [holeIndex, currentHole.ballStart, currentHole.cup]);

  useEffect(() => {
    const tick = (ts) => {
      if (lastTsRef.current == null) {
        lastTsRef.current = ts;
      }
      const dt = Math.min((ts - lastTsRef.current) / 1000, 0.033);
      lastTsRef.current = ts;


      const tickSunk = sunkRef.current;
      const tickHole = ACTIVE_HOLES[holeIndexRef.current] || ACTIVE_HOLES[0];
      if (!tickSunk) {
        const vel = velocityRef.current;
        const flight = flightRef.current;
        const speed = magnitude(vel);
        const movingVertically = flight.z > 0.01 || Math.abs(flight.vz) > 0.15;

        if (speed > 0.3 || movingVertically) {
          const surfaceNamePre = getSurfaceAtPoint(tickHole, ballRef.current);
          const surfacePhysics = SURFACE_PHYSICS[surfaceNamePre] || SURFACE_PHYSICS.rough;
          const onGround = flight.z <= GROUND_EPSILON && Math.abs(flight.vz) < 0.3;

          // Apply drag BEFORE position update so distance matches physics sim
          if (onGround) {
            const dragFactor = Math.max(0, 1 - surfacePhysics.rollFriction * dt);
            vel.x *= dragFactor;
            vel.y *= dragFactor;
            const slopeAccel = getGreenSlopeForce(tickHole, ballRef.current, surfaceNamePre);
            // Scale slope effect by ball speed — prevents slope from accelerating a stopped ball forever
            const slopeSpeedCap = Math.min(1.0, speed / 2.0);
            vel.x += slopeAccel.x * slopeSpeedCap * dt;
            vel.y += slopeAccel.y * slopeSpeedCap * dt;
          } else {
            const airDrag = Math.max(0, 1 - 0.14 * dt);
            vel.x *= airDrag;
            vel.y *= airDrag;
            // Wind force while airborne
            const wind = roundWindRef.current[holeIndexRef.current] || { speed: 0, dir: 'N' };
            const wDir = WIND_DIRS[wind.dir] || { x: 0, y: 0 };
            const wForce = wind.speed * WIND_FORCE_SCALE * dt;
            vel.x += wDir.x * wForce;
            vel.y += wDir.y * wForce;

            // Shape force: bend in air relative to strike aim axis.
            const shotCurveDeg = shotCurveDegRef.current;
            if (Math.abs(shotCurveDeg) > 0.01) {
              const aim = shotAimAngleRef.current;
              const perpDir = { x: -Math.sin(aim), y: Math.cos(aim) };
              const lateralAccel = shotCurveDeg * CURVE_FORCE;
              // Apply curve as a direction change, not a speed boost
              // Add lateral force but also slightly reduce forward component
              const fwdDir = { x: Math.cos(aim), y: Math.sin(aim) };
              const fwdSpeed = vel.x * fwdDir.x + vel.y * fwdDir.y;
              const lateralDelta = lateralAccel * dt;
              vel.x += perpDir.x * lateralDelta;
              vel.y += perpDir.y * lateralDelta;
              // Drag forward slightly to conserve energy (sliced balls don't go farther)
              const fwdDrag = Math.max(0.998, 1 - Math.abs(lateralDelta) * 0.001);
              vel.x *= fwdDrag;
              vel.y *= fwdDrag;
            }
          }

          flight.vz -= GRAVITY * dt;
          flight.z += flight.vz * dt;
          if (flight.z <= 0) {
            const impactVz = Math.abs(flight.vz);
            flight.z = 0;
            if (impactVz > MIN_BOUNCE_VZ) {
              flight.vz = impactVz * surfacePhysics.bounce;
              vel.x *= surfacePhysics.landingDamping;
              vel.y *= surfacePhysics.landingDamping;
            } else {
              flight.vz = 0;
            }
          }

          // Position update uses post-drag velocity
          let next = {
            x: ballRef.current.x + vel.x * dt,
            y: ballRef.current.y + vel.y * dt
          };

          const restitution = surfacePhysics.wallRestitution;
          if (flight.z <= 1.15) {
            next = resolveGroundCollisions(tickHole, next, vel, restitution);
          } else {
            const radiusWorld = BALL_RADIUS_WORLD;
            next.x = clamp(next.x, radiusWorld, WORLD.w - radiusWorld);
            next.y = clamp(next.y, radiusWorld, WORLD.h - radiusWorld);
          }

          // Track peak height
          if (flight.z > shotPeakHeightRef.current) shotPeakHeightRef.current = flight.z;

          // Track carry (first landing)
          if (flight.z <= GROUND_EPSILON && shotLandPosRef.current === null && shotStartPosRef.current) {
            shotLandPosRef.current = { x: next.x, y: next.y };
            shotCarryRef.current = Math.hypot(next.x - shotStartPosRef.current.x, next.y - shotStartPosRef.current.y) * YARDS_PER_WORLD;
          }

          const waterHaz = tickHole.hazards.find((h) => h.type === 'waterRect' && pointInRect(next, h));
          if (waterHaz) {
            // Ball entered water — stop motion, hide ball, show drop menu
            vel.x = 0;
            vel.y = 0;
            flight.z = 0;
            flight.vz = 0;
            // Find entry point: last position before water (use previous ball pos)
            const entryPos = { ...ballRef.current };
            const lastPos = lastShotPosRef.current || tickHole.ballStart;
            // Find lateral drop point: edge of water nearest the entry, not closer to hole
            const lateralX = clamp(entryPos.x, waterHaz.x - 8, waterHaz.x + waterHaz.w + 8);
            const lateralY = clamp(entryPos.y, waterHaz.y - 8, waterHaz.y + waterHaz.h + 8);
            // Move ball just outside the nearest edge
            const edgeDists = [
              { side: 'left', d: Math.abs(entryPos.x - waterHaz.x), pos: { x: waterHaz.x - 10, y: entryPos.y } },
              { side: 'right', d: Math.abs(entryPos.x - (waterHaz.x + waterHaz.w)), pos: { x: waterHaz.x + waterHaz.w + 10, y: entryPos.y } },
              { side: 'top', d: Math.abs(entryPos.y - waterHaz.y), pos: { x: entryPos.x, y: waterHaz.y - 10 } },
              { side: 'bottom', d: Math.abs(entryPos.y - (waterHaz.y + waterHaz.h)), pos: { x: entryPos.x, y: waterHaz.y + waterHaz.h + 10 } }
            ];
            edgeDists.sort((a, b) => a.d - b.d);
            const lateralDrop = edgeDists[0].pos;
            setBall({ x: -100, y: -100 }); // hide ball off-screen
            ballRef.current = { x: -100, y: -100 };
            setBallHeight(0);
            setWaterDropMenu({ lastPos, entryPos: lateralDrop, hazard: waterHaz });
            setWaterNotice(true);
            setStrokesCurrent((s) => s + 1);
          } else {
            ballRef.current = next;
            setBall(next);
            setBallHeight(flight.z);
            // Record tracer points (every 3rd tick to keep it lightweight)
            if (flight.z > 0.1 && shotTracerRef.current.length % 1 === 0) {
              const maxTracerYards = 200;
              const maxTracerWorld = maxTracerYards / YARDS_PER_WORLD;
              const trail = shotTracerRef.current;
              // Only keep tail within 200 yards of current position
              while (trail.length > 0 && Math.hypot(next.x - trail[0].x, next.y - trail[0].y) > maxTracerWorld) {
                trail.shift();
              }
              trail.push({ x: next.x, y: next.y, z: flight.z });
              setShotTracer([...trail]);
            }
          }

          if (magnitude(vel) < 6 && flight.z <= GROUND_EPSILON && Math.abs(flight.vz) < 0.35) {
            vel.x = 0;
            vel.y = 0;
          }
          if (flight.z <= GROUND_EPSILON && Math.abs(flight.vz) < 0.35) {
            flight.z = 0;
            flight.vz = 0;
          }

          // Ball stopped — compute final stats
          if (magnitude(vel) < 0.3 && flight.z <= GROUND_EPSILON && Math.abs(flight.vz) < 0.15 && shotStartPosRef.current) {
            shotTracerRef.current = [];
            setShotTracer([]);
            const totalDist = Math.round(Math.hypot(next.x - shotStartPosRef.current.x, next.y - shotStartPosRef.current.y) * YARDS_PER_WORLD);
            const carry = Math.round(shotCarryRef.current);
            const roll = Math.max(0, totalDist - carry);
            const endLie = getSurfaceAtPoint(tickHole, next);
            setCurrentLie(endLie);
            setLastShotStats(prev => prev ? {
              ...prev,
              carry,
              roll,
              totalDist,
              peakHeight: Math.round(shotPeakHeightRef.current * 3),
              endLie
            } : null);
            setShowShotStats(true);
            shotStartPosRef.current = null;
            // Auto-select best club for remaining distance
            if (endLie !== 'green') {
              const remainYards = Math.hypot(tickHole.cup.x - next.x, tickHole.cup.y - next.y) * YARDS_PER_WORLD;
              let autoBest = CLUBS.length - 1;
              let autoBestDiff = Infinity;
              for (let ci = 1; ci < CLUBS.length; ci++) {
                const d = Math.abs(CLUBS[ci].carryYards - remainYards);
                if (d < autoBestDiff) { autoBestDiff = d; autoBest = ci; }
              }
              setSelectedClubIndex(autoBest);
            }
          }
        }
      }

      // Camera auto-follow
      const nowMs = Date.now();
      if (nowMs >= manualPanUntilRef.current) {
        const vel = velocityRef.current;
        const ballPos = ballRef.current;
        setCamera((prev) => {
          const target = clampCameraRef.current({
            x: ballPos.x + clamp(vel.x * 0.025, -5, 5),
            y: ballPos.y + clamp(vel.y * 0.025, -7, 7)
          });
          const ease = magnitude(vel) > 1 ? 0.14 : 0.08;
          const next = clampCameraRef.current({
            x: prev.x + (target.x - prev.x) * ease,
            y: prev.y + (target.y - prev.y) * ease
          });
          if (Math.hypot(next.x - prev.x, next.y - prev.y) < 0.001) return prev;
          return next;
        });
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      lastTsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (sunk) {
      return;
    }
    if (ballHeight > 0.28 || Math.abs(flightRef.current.vz) > 0.5) {
      return;
    }
    const speed = magnitude(velocityRef.current);
    const dx = ball.x - currentHole.cup.x;
    const dy = ball.y - currentHole.cup.y;
    const dist = Math.hypot(dx, dy);
    const captureRadius = CUP_RADIUS_WORLD;
    const slowEnough = speed < 14;
    if (dist < captureRadius && slowEnough) {
      setSunk(true);
      velocityRef.current = { x: 0, y: 0 };
      flightRef.current = { z: 0, vz: 0 };
      setBallHeight(0);
      setBall(currentHole.cup);
      ballRef.current = currentHole.cup;
      setHoleScores((prev) => [
        ...prev,
        { hole: holeIndex + 1, par: currentHole.par, strokes: strokesCurrent, name: currentHole.name }
      ]);
      setScores((prev) => {
        const next = [...prev];
        next[holeIndex] = strokesCurrent;
        return next;
      });
      setShowScorecard(true);
    }
  }, [ball, ballHeight, currentHole.cup.x, currentHole.cup.y, holeIndex, strokesCurrent, sunk]);

  useEffect(() => {
    setCamera((prev) => clampCamera(prev));
  }, [halfVpH, halfVpW]);

  useEffect(() => {
    if (sunk) {
      setPuttingMode(false);
      setPuttPreview(null);
      setPuttAimPoint(null);
      setPuttSimulated(false);
      setPuttTargetPowerPct(null);
      setPuttSwingFeedback('');
      return;
    }
    const lie = getSurfaceAtPoint(currentHole, ball);
    if (lie !== currentLie) {
      setCurrentLie(lie);
    }
    const onPuttingSurface = lie === 'green' || lie === 'fringe';

    if (puttingMode && !onPuttingSurface) {
      setPuttingMode(false);
      setPuttPreview(null);
      setPuttAimPoint(null);
      setPuttSimulated(false);
      setPuttTargetPowerPct(null);
      setPuttSwingFeedback('');
      return;
    }

    // Auto-enter putting mode on green only (fringe lets you choose)
    if (!ballMoving && lie === 'green' && !puttingMode) {
      setPuttingMode(true);
      setSelectedClubIndex(0);
      setShotControlOpen(false);
      setSpinOffset({ x: 0, y: 0 });
      setPuttPreview(null);
      setPuttAimPoint(null);
      setPuttSimulated(false);
      setPuttTargetPowerPct(null);
      setPuttSwingFeedback('');
      powerRef.current = 0;
      setPowerPct(0);
      setTempoLabel('Place aim point');
      setLastShotNote('Putting mode: place an aim point on the green, tap Simulate Putt, then swing to match the target power.');
      setCamera((prev) => clampCamera({ x: ball.x, y: ball.y }));
    }
  }, [ball, ballMoving, currentHole, currentLie, puttingMode, sunk]);

  useEffect(() => {
    if (puttingMode && selectedClubIndex !== 0) {
      setSelectedClubIndex(0);
    }
  }, [puttingMode, selectedClubIndex]);

  useEffect(() => {
    if (!puttingMode) {
      return;
    }
    if (shotControlOpen) {
      setShotControlOpen(false);
    }
  }, [puttingMode, shotControlOpen]);

  // Build full scorecard rows for ALL holes (played + unplayed)
  const scorecardRows = ACTIVE_HOLES.map((hole, idx) => {
    const played = holeScores.find((s) => s.hole === idx + 1);
    return { hole: idx + 1, name: hole.name, par: hole.par, strokes: played ? played.strokes : null };
  });
  const frontNine = scorecardRows.slice(0, Math.min(9, ACTIVE_HOLES.length));
  const backNine = ACTIVE_HOLES.length > 9 ? scorecardRows.slice(9) : null;
  const sumStrokes = (rows) => rows.reduce((s, r) => s + (r.strokes || 0), 0);
  const sumPar = (rows) => rows.reduce((s, r) => s + r.par, 0);
  const playedRows = scorecardRows.filter((r) => r.strokes !== null);
  const scorecardTotalStrokes = sumStrokes(playedRows);
  const scorecardTotalPar = sumPar(playedRows);
  const scorecardDiff = scorecardTotalStrokes - scorecardTotalPar;
  const scorecardDiffText = scorecardDiff === 0 ? 'E' : `${scorecardDiff > 0 ? '+' : ''}${scorecardDiff}`;
  const scorecardDiffStyle = scorecardDiff < 0 ? styles.scoreDiffUnder : scorecardDiff > 0 ? styles.scoreDiffOver : styles.scoreDiffEven;

  const getScoreShape = (strokes, par) => {
    const diff = strokes - par;
    if (diff <= -2) return 'eagle';
    if (diff === -1) return 'birdie';
    if (diff === 1) return 'bogey';
    if (diff === 2) return 'doubleBogey';
    if (diff >= 3) return 'tripleBogey';
    return 'par';
  };

  const getHoleDiffText = (strokes, par) => {
    const diff = strokes - par;
    if (diff === 0) return 'E';
    return `${diff > 0 ? '+' : ''}${diff}`;
  };

  const setAimFromTouch = (pageX, pageY) => {
    const frame = courseFrameRef.current;
    if (frame.width <= 0 || frame.height <= 0) {
      return;
    }
    const localX = clamp(pageX - frame.x, 0, frame.width);
    const localY = clamp(pageY - frame.y, 0, frame.height);
    const target = toWorld({ x: localX, y: localY });
    if (puttingMode) {
      const green = currentHole.terrain?.green;
      if (!green || !pointInRect(target, green)) {
        return;
      }
      setPuttAimPoint(target);
      setPuttSimulated(false);
      setPuttTargetPowerPct(null);
      setPuttSwingFeedback('');
    }
    const dir = { x: target.x - ballRef.current.x, y: target.y - ballRef.current.y };
    if (magnitude(dir) < 0.2) {
      return;
    }
    setAimAngle(Math.atan2(dir.y, dir.x));
  };

  const handleSimulatePutt = () => {
    if (!puttingMode || sunk || ballMoving || !puttAimPoint) {
      return;
    }
    const dx = puttAimPoint.x - ballRef.current.x;
    const dy = puttAimPoint.y - ballRef.current.y;
    const distWorld = Math.hypot(dx, dy);
    if (distWorld < 0.1) {
      return;
    }
    const targetAngle = Math.atan2(dy, dx);
    const targetPower = puttPowerForDistance(distWorld);
    setAimAngle(targetAngle);
    powerRef.current = targetPower;
    setPowerPct(targetPower);
    setPuttPreview(simulatePuttPreview(0, targetPower, targetAngle));
    setPuttTargetPowerPct(targetPower);
    setPuttSimulated(true);
    setPuttSwingFeedback('');
    setTempoLabel(`Target: ${targetPower}%`);
    setLastShotNote('Preview locked. Swing now and match the target power while keeping the stroke straight.');
  };

  const isTouchInsideCourse = (evt) => {
    const frame = courseFrameRef.current;
    if (frame.width <= 0 || frame.height <= 0) {
      return false;
    }
    const { pageX, pageY } = evt.nativeEvent;
    return (
      pageX >= frame.x &&
      pageX <= frame.x + frame.width &&
      pageY >= frame.y &&
      pageY <= frame.y + frame.height
    );
  };

  const getTouchesCentroid = (nativeEvent) => {
    const touches = nativeEvent.touches;
    if (!touches || touches.length < 2) return null;
    return {
      x: (touches[0].pageX + touches[1].pageX) / 2,
      y: (touches[0].pageY + touches[1].pageY) / 2
    };
  };

  const aimResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => {
          if (sunk || ballMoving) {
            return false;
          }
          return true;
        },
        onStartShouldSetPanResponderCapture: () => false,
        onPanResponderGrant: (evt) => {
          syncCourseFrame();
          if (!isTouchInsideCourse(evt)) {
            return;
          }
          webPanStartCameraRef.current = cameraRef.current;
          const centroid = getTouchesCentroid(evt.nativeEvent);
          if (centroid) {
            isTwoFingerPanningRef.current = true;
            panCentroidRef.current = centroid;
            setIsAiming(false);
            return;
          }
          isTwoFingerPanningRef.current = false;
          setIsAiming(true);
          setAimFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
        },
        onMoveShouldSetPanResponder: () => false,
        onPanResponderMove: (evt, gestureState) => {
          const centroid = getTouchesCentroid(evt.nativeEvent);
          if (centroid) {
            isTwoFingerPanningRef.current = true;
            const prev = panCentroidRef.current;
            if (prev) {
              const dx = centroid.x - prev.x;
              const dy = centroid.y - prev.y;
              if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                manualPanUntilRef.current = Date.now() + MANUAL_PAN_GRACE_MS;
                setCamera((c) => clampCamera({ x: c.x - dx / pixelsPerWorld, y: c.y - dy / pixelsPerWorld }));
              }
            }
            panCentroidRef.current = centroid;
            setIsAiming(false);
            return;
          }
          panCentroidRef.current = null;
          if (isTwoFingerPanningRef.current) {
            setIsAiming(false);
            return;
          }
          // On web: short drag = aim, long drag = pan
          if (Platform.OS === 'web') {
            const totalMove = Math.hypot(gestureState.dx, gestureState.dy);
            if (totalMove > 40) {
              // Long drag — switch to pan mode
              setIsAiming(false);
              manualPanUntilRef.current = Date.now() + MANUAL_PAN_GRACE_MS;
              const startCamera = webPanStartCameraRef.current || cameraRef.current;
              setCamera(clampCamera({
                x: startCamera.x - gestureState.dx / pixelsPerWorld,
                y: startCamera.y - gestureState.dy / pixelsPerWorld
              }));
              return;
            }
          }
          if (!isTouchInsideCourse(evt)) {
            return;
          }
          setAimFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
        },
        onPanResponderRelease: (evt, gestureState) => {
          if (isTouchInsideCourse(evt) && Math.abs(gestureState.dx) < 40 && Math.abs(gestureState.dy) < 40) {
            setAimFromTouch(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
          }
          setIsAiming(false);
          if (isTwoFingerPanningRef.current || Platform.OS === 'web') {
            manualPanUntilRef.current = Date.now() + MANUAL_PAN_GRACE_MS;
          }
          isTwoFingerPanningRef.current = false;
          panCentroidRef.current = null;
          webPanStartCameraRef.current = null;
        },
        onPanResponderTerminate: () => {
          setIsAiming(false);
          if (isTwoFingerPanningRef.current || Platform.OS === 'web') {
            manualPanUntilRef.current = Date.now() + MANUAL_PAN_GRACE_MS;
          }
          isTwoFingerPanningRef.current = false;
          panCentroidRef.current = null;
          webPanStartCameraRef.current = null;
        }
      }),
    [ballMoving, currentHole, pixelsPerWorld, puttingMode, sunk]
  );

  const getShotControlMetrics = (offset = spinOffset) => {
    const xNorm = clamp(offset.x / MAX_SPIN_OFFSET, -1, 1);
    const yNorm = clamp(offset.y / MAX_SPIN_OFFSET, -1, 1);
    const launchAdjust = clamp(1 - yNorm * 0.4, 0.68, 1.38);
    const spinAdjust = clamp(1 - yNorm * 0.36, 0.7, 1.34);
    const curveDeg = -xNorm * 18;
    let shapeLabel = 'Dead straight';

    if (xNorm < -0.55) shapeLabel = 'Hook';
    else if (xNorm < -0.18) shapeLabel = 'Draw';
    else if (xNorm > 0.55) shapeLabel = 'Slice';
    else if (xNorm > 0.18) shapeLabel = 'Fade';

    let flightLabel = 'Mid flight';
    if (yNorm < -0.4) flightLabel = 'Higher launch, less spin';
    else if (yNorm > 0.4) flightLabel = 'Lower launch, more spin';

    return { xNorm, yNorm, launchAdjust, spinAdjust, curveDeg, shapeLabel, flightLabel };
  };

  const resolveGroundCollisions = (hole, next, vel, restitution) => {
    const radiusWorld = BALL_RADIUS_WORLD;
    let adjusted = {
      x: clamp(next.x, radiusWorld, WORLD.w - radiusWorld),
      y: clamp(next.y, radiusWorld, WORLD.h - radiusWorld)
    };

    hole.obstacles.forEach((o) => {
      if (o.type === 'rect') {
        const nearestX = clamp(adjusted.x, o.x, o.x + o.w);
        const nearestY = clamp(adjusted.y, o.y, o.y + o.h);
        const dx = adjusted.x - nearestX;
        const dy = adjusted.y - nearestY;
        const overlap = radiusWorld * radiusWorld - (dx * dx + dy * dy);
        if (overlap > 0) {
          let normal = normalize({ x: dx, y: dy });
          if (Math.abs(normal.x) < 0.01 && Math.abs(normal.y) < 0.01) {
            const center = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
            normal = normalize({ x: adjusted.x - center.x, y: adjusted.y - center.y });
            if (Math.abs(normal.x) < 0.01 && Math.abs(normal.y) < 0.01) {
              normal = { x: 0, y: -1 };
            }
          }
          adjusted = {
            x: nearestX + normal.x * (radiusWorld + 0.1),
            y: nearestY + normal.y * (radiusWorld + 0.1)
          };
          const vn = vel.x * normal.x + vel.y * normal.y;
          if (vn < 0) {
            vel.x -= (1 + restitution) * vn * normal.x;
            vel.y -= (1 + restitution) * vn * normal.y;
          }
        }
      }

      if (o.type === 'circle') {
        const dx = adjusted.x - o.x;
        const dy = adjusted.y - o.y;
        const dist = Math.hypot(dx, dy);
        const minDist = o.r + radiusWorld;
        if (dist < minDist) {
          const normal = dist < 0.001 ? { x: 1, y: 0 } : { x: dx / dist, y: dy / dist };
          adjusted = {
            x: o.x + normal.x * (minDist + 0.1),
            y: o.y + normal.y * (minDist + 0.1)
          };
          const vn = vel.x * normal.x + vel.y * normal.y;
          if (vn < 0) {
            vel.x -= (1 + restitution) * vn * normal.x;
            vel.y -= (1 + restitution) * vn * normal.y;
          }
        }
      }
    });

    return adjusted;
  };

  const getLaunchData = (deviation = 0, options = {}) => {
    const shotMetrics = getShotControlMetrics();
    const lieSwingSens = (SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough).swingSensitivity || 1.0;
    // Exponential overpower penalty: above 100%, deviation is amplified exponentially
    const effectivePowerForPenalty = options.powerPct ?? powerRef.current;
    let overpowerMult = 1.0;
    if (effectivePowerForPenalty > 100) {
      const overPct = effectivePowerForPenalty - 100; // 0-20
      // Exponential: 1.0 at 100%, ~1.08 at 105%, ~1.35 at 110%, ~1.8 at 115%, ~2.4 at 120%
      overpowerMult = 1.0 + (Math.pow(1.06, overPct) - 1) * 1.2;
    }
    const baseSensitivity = 40; // up from 25 — more punishing baseline
    const rawCurveDeg = deviation * baseSensitivity * lieSwingSens * overpowerMult;
    // Cap curve at ±45° — no golf shot curves more than that
    const swingCurveDeg = clamp(rawCurveDeg, -45, 45);
    const totalCurveDeg = shotMetrics.curveDeg + swingCurveDeg;
    const launchCurveDeg = totalCurveDeg * CURVE_LAUNCH_BLEND;
    const baseAimAngle = options.aimAngle ?? aimAngle;
    const finalAngle = baseAimAngle + degToRad(launchCurveDeg);
    const direction = { x: Math.cos(finalAngle), y: Math.sin(finalAngle) };
    const effectivePower = options.powerPct ?? powerRef.current;
    const launchRatio = clamp(effectivePower / 125, 0, 1);
    return {
      shotMetrics,
      swingCurveDeg,
      totalCurveDeg,
      finalAngle,
      direction,
      effectivePower,
      launchRatio
    };
  };

  const simulatePuttPreview = (deviation = 0, overridePowerPct = null, overrideAimAngle = null) => {
    const effectivePower = overridePowerPct ?? powerRef.current;
    if (effectivePower <= 5) {
      return null;
    }
    const launch = getLaunchData(deviation, { powerPct: effectivePower, aimAngle: overrideAimAngle });
    const puttSpeed = (CLUBS[0].carryYards / YARDS_PER_WORLD) * launch.launchRatio * 2.8;
    const vel = {
      x: launch.direction.x * puttSpeed,
      y: launch.direction.y * puttSpeed
    };
    let pos = { ...ballRef.current };
    const path = [{ x: pos.x, y: pos.y }];
    let finalPos = { ...pos };

    for (let i = 0; i < PUTT_PREVIEW_MAX_TICKS; i += 1) {
      const surfaceName = getSurfaceAtPoint(currentHole, pos);
      const surfacePhysics = SURFACE_PHYSICS[surfaceName] || SURFACE_PHYSICS.rough;
      const dragFactor = Math.max(0, 1 - surfacePhysics.rollFriction * PUTT_PREVIEW_DT);
      vel.x *= dragFactor;
      vel.y *= dragFactor;
      const slope = getGreenSlopeForce(currentHole, pos, surfaceName);
      const previewSpeed = magnitude(vel);
      const previewSlopeCap = Math.min(1.0, previewSpeed / 2.0);
      vel.x += slope.x * previewSlopeCap * PUTT_PREVIEW_DT;
      vel.y += slope.y * previewSlopeCap * PUTT_PREVIEW_DT;

      const restitution = surfacePhysics.wallRestitution;
      let next = {
        x: pos.x + vel.x * PUTT_PREVIEW_DT,
        y: pos.y + vel.y * PUTT_PREVIEW_DT
      };
      next = resolveGroundCollisions(currentHole, next, vel, restitution);

      const fellInWater = currentHole.hazards.some((h) => h.type === 'waterRect' && pointInRect(next, h));
      pos = fellInWater ? currentHole.ballStart : next;
      finalPos = { ...pos };

      if (i % PUTT_PREVIEW_SAMPLE_TICKS === 0) {
        path.push({ x: pos.x, y: pos.y });
      }

      if (magnitude(vel) < 0.3) {
        break;
      }
    }

    const restToCupWorld = Math.hypot(currentHole.cup.x - finalPos.x, currentHole.cup.y - finalPos.y);
    return {
      path,
      finalPos,
      distanceToCupYards: Math.max(0, Math.round(restToCupWorld * YARDS_PER_WORLD)),
      endLie: getSurfaceAtPoint(currentHole, finalPos)
    };
  };

  const strikeBall = (deviation = 0, { tempoMult = 1.0, tempoTag = 'Normal' } = {}) => {
    // Apply tempo multiplier to deviation — rushed/slow swings are less accurate
    const tempoAdjustedDeviation = clamp(deviation * tempoMult, -1, 1);
    if (sunk || ballMoving) return;

    const launch = getLaunchData(tempoAdjustedDeviation);
    const speed = speedFromPower(launch.effectivePower, selectedClub);
    const liePhys = SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough;
    const [penMin, penMax] = liePhys.powerPenalty;
    const liePenalty = penMin + Math.random() * (penMax - penMin);
    const horizSpeed = speed * liePenalty;

    velocityRef.current = {
      x: launch.direction.x * horizSpeed,
      y: launch.direction.y * horizSpeed
    };
    shotCurveDegRef.current = launch.totalCurveDeg;
    shotAimAngleRef.current = aimAngle;
    if (selectedClub.key === 'PT') {
      // Putter: pure ground roll, no flight. Speed calibrated so ball rolls the aim distance.
      const puttSpeed = (selectedClub.carryYards / YARDS_PER_WORLD) * launch.launchRatio * 2.8;
      velocityRef.current = {
        x: launch.direction.x * puttSpeed,
        y: launch.direction.y * puttSpeed
      };
      flightRef.current = { z: 0, vz: 0 };
    } else {
      // Real golf: all clubs peak ~90-105ft (Trackman PGA data)
      const targetHangTime = (3.2 + selectedClub.launch * 0.8) * launch.launchRatio;
      const launchVz = (GRAVITY * targetHangTime * 0.5) * launch.shotMetrics.launchAdjust;
      flightRef.current = {
        z: 0.08,
        vz: launchVz
      };
    }

    // Track shot stats
    lastShotPosRef.current = { ...ballRef.current };
    shotStartPosRef.current = { ...ballRef.current };
    shotLandPosRef.current = null;
    shotPeakHeightRef.current = 0;
    shotCarryRef.current = 0;
    shotRollRef.current = 0;
    setShowShotStats(false);

    const contactLabel = Math.abs(deviation) < 0.08 ? 'Center' : Math.abs(deviation) < 0.25 ? (deviation < 0 ? 'Slight Heel' : 'Slight Toe') : (deviation < 0 ? 'Heel' : 'Toe');
    const shotShapeLabel = Math.abs(deviation) < 0.1 ? 'Straight' : deviation < -0.3 ? 'Hook' : deviation > 0.3 ? 'Slice' : deviation < 0 ? 'Draw' : 'Fade';

    // Normalize swing path for visualization (relative to start, scaled to fit a box)
    const rawPath = [...fullSwingPathRef.current];
    let swingPath = [];
    if (rawPath.length > 2) {
      const sx = rawPath[0].x, sy = rawPath[0].y;
      const pts = rawPath.map(p => ({ x: p.x - sx, y: p.y - sy, phase: p.phase }));
      const maxAbs = Math.max(1, ...pts.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))));
      swingPath = pts.map(p => ({ x: p.x / maxAbs, y: p.y / maxAbs, phase: p.phase }));
    }

    setLastShotStats({
      club: selectedClub.short,
      clubName: selectedClub.name,
      power: launch.effectivePower,
      contact: contactLabel,
      shape: shotShapeLabel,
      deviationDeg: Math.round(launch.swingCurveDeg * 10) / 10,
      carry: 0,
      roll: 0,
      totalDist: 0,
      peakHeight: 0,
      startLie: currentLie,
      endLie: 'unknown',
      swingPath,
      tempoTag,
      tempoMult
    });

    setBallHeight(flightRef.current.z);
    shotTracerRef.current = [];
    setShotTracer([]);
    const tempoEmoji = tempoTag === 'Perfect' ? '✨' : tempoTag === 'Smooth' ? '👌' : tempoTag === 'Rushed' ? '⚡' : tempoTag === 'Slow' ? '🐢' : '';
    setTempoLabel(`${tempoEmoji}${tempoTag} • ${shotShapeLabel} • ${launch.effectivePower}%`);
    setStrokesCurrent((s) => s + 1);
    setShotControlOpen(false);
    setPuttPreview(null);
    setPuttSimulated(false);
    setSwingPhase('idle');
    setPowerPct(0);
    powerRef.current = 0;
    setSwingDeviation(0);
    swingDeviationRef.current = 0;
    backDeviationRef.current = 0;
    if (puttingMode) {
      const swingPower = Math.round(launch.effectivePower);
      const targetText = typeof puttTargetPowerPct === 'number' ? ` (Target: ${puttTargetPowerPct}%)` : '';
      setPuttAimPoint(null);
      setPuttSwingFeedback(`Your swing: ${swingPower}%${targetText}`);
      setLastShotNote(`Putt struck at ${swingPower}%${targetText}.`);
    } else {
      setPuttSwingFeedback('');
      setLastShotNote(`${selectedClub.short} — ${contactLabel}, ${shotShapeLabel.toLowerCase()}, ${launch.effectivePower}% power.`);
    }
  };

  const shotControlResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => shotControlOpen && !sunk && !ballMoving,
        onStartShouldSetPanResponderCapture: () => shotControlOpen && !sunk && !ballMoving,
        onPanResponderGrant: (evt) => {
          if (!shotControlOpen) {
            return;
          }
          const dx = evt.nativeEvent.locationX - PAD_CENTER;
          const dy = evt.nativeEvent.locationY - PAD_CENTER;
          const distanceFromDot = Math.hypot(dx - spinOffset.x, dy - spinOffset.y);
          setDraggingSpinDot(distanceFromDot <= SPIN_DOT_RADIUS + 12);
        },
        onPanResponderMove: (evt) => {
          if (!shotControlOpen || !draggingSpinDot) {
            return;
          }
          const dx = evt.nativeEvent.locationX - PAD_CENTER;
          const dy = evt.nativeEvent.locationY - PAD_CENTER;
          const distance = Math.hypot(dx, dy);
          const scale = distance > MAX_SPIN_OFFSET ? MAX_SPIN_OFFSET / distance : 1;
          const nextOffset = { x: dx * scale, y: dy * scale };
          setSpinOffset(nextOffset);
          const metrics = getShotControlMetrics(nextOffset);
          setTempoLabel(`${metrics.shapeLabel} • ${metrics.flightLabel}`);
        },
        onPanResponderRelease: () => {
          setDraggingSpinDot(false);
        },
        onPanResponderTerminate: () => {
          setDraggingSpinDot(false);
        }
      }),
    [ballMoving, draggingSpinDot, shotControlOpen, sunk, spinOffset.x, spinOffset.y]
  );

  const swingResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !sunk && !ballMoving && !shotControlOpen,
        onStartShouldSetPanResponderCapture: () => !sunk && !ballMoving && !shotControlOpen,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          swingStartRef.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
          swingLowestRef.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
          swingTrailRef.current = [];
          fullSwingPathRef.current = [{ x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY, phase: 'start' }];
          backswingStartTimeRef.current = Date.now();
          transitionTimeRef.current = 0;
          setSwingPhase('backswing');
          powerRef.current = 0;
          peakPowerRef.current = 0;
          swingLockedRef.current = false;
          setPowerPct(0);
          setSwingDeviation(0);
        },
        onPanResponderMove: (evt, gestureState) => {
          const currentY = evt.nativeEvent.pageY;
          const currentX = evt.nativeEvent.pageX;
          const dy = currentY - swingStartRef.current.y;

          fullSwingPathRef.current.push({ x: currentX, y: currentY, phase: swingLockedRef.current ? 'forward' : 'back' });

          if (!swingLockedRef.current) {
            // BACKSWING: dragging down charges power
            const dyFromLowest = currentY - swingLowestRef.current.y;
            if (dy > 0) {
              // Still moving down or at lowest point
              const pct = clamp(Math.round(dy / 0.8), 0, 120);
              powerRef.current = pct;
              peakPowerRef.current = Math.max(peakPowerRef.current, pct);
              setPowerPct(pct);
              // Track backswing L/R deviation from start X
              const backDevPx = currentX - swingStartRef.current.x;
              backDeviationRef.current = clamp(backDevPx / 50, -1, 1);
              swingLowestRef.current = { x: currentX, y: currentY };
              swingTrailRef.current = [];
            } else if (peakPowerRef.current > 5 && dyFromLowest < -8) {
              // Finger reversed direction upward — LOCK power and start forward swing
              swingLockedRef.current = true;
              powerRef.current = peakPowerRef.current;
              setPowerPct(peakPowerRef.current);
              setSwingPhase('forward');
              transitionTimeRef.current = Date.now();
              // Short buzz at the top of backswing — cue to pause
              hapticBuzz(30);
            }
          } else {
            // FORWARD SWING: track deviation
            swingTrailRef.current.push({ x: currentX, y: currentY });
            const centerX = swingLowestRef.current.x;
            const devPx = currentX - centerX;
            const forwardDev = clamp(devPx / 45, -1, 1); // tighter threshold (was 60)
            // Combine back + forward deviation (back contributes ~40%)
            const combinedDev = clamp(forwardDev + backDeviationRef.current * 0.4, -1, 1);
            setSwingDeviation(combinedDev);
            swingDeviationRef.current = combinedDev;
          }
        },
        onPanResponderRelease: () => {
          if (powerRef.current > 5) {
            // Compute tempo: time between reaching the top and releasing (forward swing duration)
            const now = Date.now();
            const forwardMs = transitionTimeRef.current > 0 ? now - transitionTimeRef.current : 999;
            // Perfect tempo window: 80-220ms forward swing (smooth transition, not rushed or crawling)
            // Rushed: < 60ms (blew through the top)
            // Slow: > 350ms (froze at the top)
            let tempoMult = 1.0; // accuracy multiplier (lower = worse)
            let tempoTag = 'Normal';
            if (forwardMs < 60) {
              // Rushed — penalize deviation (magnify it)
              tempoMult = 1.35;
              tempoTag = 'Rushed';
            } else if (forwardMs <= 220) {
              // Perfect window
              tempoMult = 0.82;
              tempoTag = 'Perfect';
              // Double-tap vibration/audio for perfect tempo
              hapticDoubleTap();
            } else if (forwardMs <= 350) {
              // Good but slightly slow
              tempoMult = 0.92;
              tempoTag = 'Smooth';
            } else {
              // Too slow — mild penalty
              tempoMult = 1.12;
              tempoTag = 'Slow';
            }
            strikeBall(swingDeviationRef.current, { tempoMult, tempoTag });
          } else {
            setSwingPhase('idle');
            setPowerPct(0);
            powerRef.current = 0;
          }
        },
        onPanResponderTerminate: () => {
          setSwingPhase('idle');
          setPowerPct(0);
          powerRef.current = 0;
        }
      }),
    [ballMoving, shotControlOpen, sunk, swingDeviation]
  );

  const screenBall = toScreen(ball);
  const screenCup = toScreen(currentHole.cup);
  // Smooth arc: sqrt scale prevents ceiling effect while keeping ball on-screen
  const rawLiftPx = ballHeight * pixelsPerWorld * 1.55;
  const liftPx = rawLiftPx > 0 ? Math.sqrt(rawLiftPx) * 8 : 0;
  const airborneRatio = clamp(ballHeight / 35, 0, 1);
  const ballVisualScale = 1 - airborneRatio * 0.12;
  const shadowScale = 1 + airborneRatio * 0.5;
  const shadowOpacity = 0.28 - airborneRatio * 0.18;
  const worldOffsetX = viewWidth / 2 - camera.x * pixelsPerWorld;
  const worldOffsetY = viewHeight / 2 - camera.y * pixelsPerWorld;

  const isLastHole = safeHoleIndex === ACTIVE_HOLES.length - 1;
  const shotMetrics = getShotControlMetrics();
  const overSwing = powerPct > 100;
  const neutralStrike = { launch: 1, spin: 1 };

  const aimDir = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };
  const aimPerp = { x: -aimDir.y, y: aimDir.x };
  const previewOverpowerMult = powerPct > 100 ? 1.0 + (Math.pow(1.06, powerPct - 100) - 1) * 1.2 : 1.0;
  const rawPreviewCurveDeg = shotMetrics.curveDeg + swingDeviation * 40 * previewOverpowerMult;
  const totalPreviewCurveDeg = clamp(rawPreviewCurveDeg, -45, 45);
  const distanceToCupWorld = Math.hypot(currentHole.cup.x - ball.x, currentHole.cup.y - ball.y);
  const yardsToCup = Math.max(0, Math.round(distanceToCupWorld * YARDS_PER_WORLD));
  const windData = roundWind[safeHoleIndex] || { speed: 0, dir: 'N' };
  const windLabel = `${windData.speed} mph`;
  const windArrow = WIND_ARROWS[windData.dir] || '•';
  const windDirLabel = windData.dir;
  const stockClubYards = Math.round(estimateStraightDistance(100, selectedClub, neutralStrike) * YARDS_PER_WORLD);
  const previewPower = powerPct;
  const previewYards = Math.round(estimateStraightDistance(previewPower, selectedClub, { launch: shotMetrics.launchAdjust, spin: shotMetrics.spinAdjust }) * YARDS_PER_WORLD);
  const shotShape = `${SHOT_SHAPE_HINTS[selectedClub.key] || 'Neutral'} • ${shotMetrics.shapeLabel}`;
  const shotNumber = sunk ? strokesCurrent : strokesCurrent + 1;
  const puttTargetText = typeof puttTargetPowerPct === 'number' ? `${puttTargetPowerPct}%` : '--';
  const puttStatusText = puttSwingFeedback
    || (puttSimulated ? (puttPreview ? `${puttPreview.distanceToCupYards} yd to cup` : 'Preview active') : 'Place aim point on green');
  const puttPreviewDots = puttPreview?.path?.map((point, i, arr) => ({
    key: `putt-preview-${i}`,
    point,
    size: i === arr.length - 1 ? 8 : 3.4 + (i / Math.max(1, arr.length - 1)) * 2.4,
    opacity: 0.95 - (i / Math.max(1, arr.length - 1)) * 0.65
  })) || [];

  const slopeArrows = (currentHole.slopes || []).flatMap((slope, slopeIndex) => {
    const green = currentHole.terrain?.green;
    if (!green) {
      return [];
    }
    const dir = getSlopeDirectionUnit(slope.dir);
    if (Math.abs(dir.x) < 0.001 && Math.abs(dir.y) < 0.001) {
      return [];
    }
    const cx = green.x + green.w * clamp(slope.cx ?? 0.5, 0, 1);
    const cy = green.y + green.h * clamp(slope.cy ?? 0.5, 0, 1);
    const str = clamp(slope.strength ?? 0.5, 0, 1);
    // Stronger slope = tighter grid (more arrows packed closer)
    const spacing = Math.max(3, 8 - str * 5); // 3-8 world units apart
    const radius = Math.min(green.w, green.h) * 0.35;
    const arrows = [];
    for (let gx = -radius; gx <= radius; gx += spacing) {
      for (let gy = -radius; gy <= radius; gy += spacing) {
        const px = cx + gx;
        const py = cy + gy;
        // Only inside green and within slope influence radius
        if (!pointInRect({ x: px, y: py }, green)) continue;
        const dist = Math.hypot(gx, gy);
        if (dist > radius) continue;
        const fade = clamp(1 - dist / radius, 0.2, 1);
        arrows.push({
          key: `slope-arrow-${slopeIndex}-${gx.toFixed(0)}-${gy.toFixed(0)}`,
          x: px,
          y: py,
          char: WIND_ARROWS[slope.dir] || '•',
          opacity: fade * 0.7
        });
      }
    }
    return arrows;
  });

  const rayToWorldEdge = (() => {
    const candidates = [];
    if (Math.abs(aimDir.x) > 0.0001) {
      const tx0 = (0 - ball.x) / aimDir.x;
      const tx1 = (WORLD.w - ball.x) / aimDir.x;
      if (tx0 > 0) candidates.push(tx0);
      if (tx1 > 0) candidates.push(tx1);
    }
    if (Math.abs(aimDir.y) > 0.0001) {
      const ty0 = (0 - ball.y) / aimDir.y;
      const ty1 = (WORLD.h - ball.y) / aimDir.y;
      if (ty0 > 0) candidates.push(ty0);
      if (ty1 > 0) candidates.push(ty1);
    }
    if (!candidates.length) {
      return 0;
    }
    return Math.max(0, Math.min(...candidates));
  })();
  const aimGuideWorld = clamp(
    estimateStraightDistance(100, selectedClub, { launch: shotMetrics.launchAdjust, spin: shotMetrics.spinAdjust }),
    6,
    rayToWorldEdge
  );

  const aimLineDots = [0.25, 0.5, 0.75, 1].map((pct) => {
    const worldDist = aimGuideWorld * pct;
    const curveOffset = Math.sin(pct * Math.PI * 0.95) * aimGuideWorld * degToRad(totalPreviewCurveDeg) * 0.07 * pct;
    const loftOffset = -(shotMetrics.launchAdjust - 1) * 10 * Math.sin(pct * Math.PI) * 0.4;
    const point = {
      x: ball.x + aimDir.x * worldDist + aimPerp.x * curveOffset,
      y: ball.y + aimDir.y * worldDist + aimPerp.y * curveOffset + loftOffset
    };
    const screen = toScreen(point);
    return {
      key: `aim-dot-${pct}`,
      x: screen.x,
      y: screen.y,
      size: 4 + pct * 3,
      opacity: 0.5 + pct * 0.35,
      color: '#ffdd44'
    };
  });

  const golferAnchorWorld = {
    x: clamp(golferBallAnchor.x - 8.1 + aimPerp.x * 0.6, 2.5, WORLD.w - 2.5),
    y: clamp(golferBallAnchor.y - aimDir.y * 1.6 + aimPerp.y * 0.6, 2.5, WORLD.h - 2.5)
  };
  const golferAnchor = toScreen(golferAnchorWorld);
  const golferPixelSize = clamp(pixelsPerWorld * 0.62, 1.55, 2.5);
  const golferWidth = GOLFER_SPRITE_ROWS[0].length * golferPixelSize;
  const golferHeight = GOLFER_SPRITE_ROWS.length * golferPixelSize;
  const golferAngle = (aimAngle * 180) / Math.PI + 90;

  if (gameScreen === 'menu') {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.spaceMenuScreen}>
          <View style={styles.menuStarsLayer} pointerEvents="none">
            {starField.map((star) => (
              <View
                key={star.key}
                style={[
                  styles.menuStar,
                  {
                    left: star.left,
                    top: star.top,
                    width: star.size,
                    height: star.size,
                    backgroundColor: star.color,
                    opacity: star.opacity
                  }
                ]}
              />
            ))}
          </View>
          <View style={styles.menuGreenGlow} pointerEvents="none" />

          <View style={styles.menuContentWrap}>
            <Text style={styles.menuDataBar}>◂ EST. 2155 · 14 SPECIES · 9 STAR SYSTEMS ▸</Text>

            <View style={styles.menuTitleBlock}>
              <Text style={styles.menuTitleTop}>INTERGALACTIC</Text>
              <View style={styles.menuTitleBottomRow}>
                <Text style={styles.menuTitleBottomMain}>G ⛳ LF</Text>
                <Text style={styles.menuTitleTour}>TOUR</Text>
              </View>
            </View>

            <View style={styles.heroWrap}>
              <View style={styles.heroRing} />
              <View style={styles.heroBall}>
                <View style={[styles.heroDimple, { top: 20, left: 18 }]} />
                <View style={[styles.heroDimple, { top: 26, right: 20 }]} />
                <View style={[styles.heroDimple, { bottom: 20, left: 26 }]} />
                <View style={[styles.heroDimple, { bottom: 24, right: 24 }]} />
                <View style={[styles.heroDimple, { top: 40, left: 36 }]} />
              </View>
              <View style={styles.heroFlagPole} />
              <View style={styles.heroFlag} />
            </View>

            <View style={styles.menuButtonStack}>
              <View style={styles.menuButtonWrap}>
                <View style={[styles.spaceMenuBtn, styles.spaceMenuBtnDisabled]}>
                  <Text style={styles.spaceMenuBtnLeftMuted}>CAREER</Text>
                  <Text style={styles.spaceMenuBtnRightMuted}>SEASON 03 &gt;</Text>
                </View>
                <Text style={styles.menuSoonBadge}>COMING SOON</Text>
              </View>

              <Pressable
                style={styles.spaceMenuBtnActive}
                onPress={() => setGameScreen('golfer-select')}
              >
                <Text style={styles.spaceMenuBtnLeft}>EXHIBITION</Text>
                <Text style={styles.spaceMenuBtnRight}>QUICK 9 &gt;</Text>
                <View style={[styles.lCorner, styles.lCornerTopLeft]} />
                <View style={[styles.lCorner, styles.lCornerTopRight]} />
                <View style={[styles.lCorner, styles.lCornerBottomLeft]} />
                <View style={[styles.lCorner, styles.lCornerBottomRight]} />
              </Pressable>

              <Pressable
                style={styles.spaceMenuBtn}
                onPress={() => setGameScreen('settings')}
              >
                <Text style={styles.spaceMenuBtnLeft}>SETTINGS</Text>
                <Text style={styles.spaceMenuBtnRight}>&gt;</Text>
              </Pressable>
            </View>

            <View style={styles.menuBottomBar}>
              <Text style={styles.menuBottomLeft}>
                <Text style={styles.menuBottomDot}>●</Text> FOLD DRIVE · ONLINE
              </Text>
              <Text style={styles.menuBottomRight}>V.2187.4 ■</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ═══════════════ GOLFER SELECT SCREEN ═══════════════
  if (gameScreen === 'golfer-select') {
    const g = selectedGolfer;
    const statKeys = ['power', 'accuracy', 'touch', 'spinControl', 'putting', 'recovery'];
    const statLabels = { power: 'Power', accuracy: 'Accuracy', touch: 'Touch', spinControl: 'Spin Ctrl', putting: 'Putting', recovery: 'Recovery' };
    const mentalKeys = ['focus', 'composure', 'courseManagement'];
    const mentalLabels = { focus: 'Focus', composure: 'Composure', courseManagement: 'Course IQ' };
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.spaceMenuScreen}>
          <View style={styles.menuStarsLayer} pointerEvents="none">
            {starField.map((star) => <View key={star.key} style={[styles.menuStar, { left: `${star.x}%`, top: `${star.y}%`, width: star.size, height: star.size, opacity: star.opacity }]} />)}
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.spaceMenuSubtitle}>SELECT GOLFER</Text>

          <View style={styles.golferCard}>
            {/* Avatar */}
            <View style={styles.golferAvatarWrap}>
              <View style={[styles.golferAvatarBlock, { backgroundColor: g.avatar.hat }]} />
              <View style={[styles.golferAvatarBlock, { backgroundColor: g.avatar.skin }]} />
              <View style={[styles.golferAvatarBlock, { backgroundColor: g.avatar.shirt }]} />
              <View style={[styles.golferAvatarBlock, { backgroundColor: g.avatar.pants }]} />
            </View>
            <View style={styles.golferInfo}>
              <Text style={styles.golferName}>{g.name}</Text>
              <Text style={styles.golferSpecies}>{g.species} • {g.origin}</Text>
              <Text style={styles.golferBio}>{g.bio}</Text>
            </View>
          </View>

          {/* Stats bars */}
          <View style={styles.golferStatsSection}>
            <Text style={styles.golferStatsSectionTitle}>SKILLS</Text>
            {statKeys.map(key => (
              <View key={key} style={styles.golferStatRow}>
                <Text style={styles.golferStatName}>{statLabels[key]}</Text>
                <View style={styles.golferStatBarBg}>
                  <View style={[styles.golferStatBarFill, { width: `${g.stats[key]}%`, backgroundColor: g.stats[key] >= 70 ? '#4ade80' : g.stats[key] >= 40 ? '#fbbf24' : '#ef4444' }]} />
                </View>
                <Text style={styles.golferStatValue}>{g.stats[key]}</Text>
              </View>
            ))}
          </View>

          <View style={styles.golferStatsSection}>
            <Text style={styles.golferStatsSectionTitle}>MENTAL</Text>
            {mentalKeys.map(key => (
              <View key={key} style={styles.golferStatRow}>
                <Text style={styles.golferStatName}>{mentalLabels[key]}</Text>
                <View style={styles.golferStatBarBg}>
                  <View style={[styles.golferStatBarFill, { width: `${g.mental[key]}%`, backgroundColor: g.mental[key] >= 70 ? '#4ade80' : g.mental[key] >= 40 ? '#fbbf24' : '#ef4444' }]} />
                </View>
                <Text style={styles.golferStatValue}>{g.mental[key]}</Text>
              </View>
            ))}
          </View>

          <View style={styles.golferNavRow}>
            <Pressable style={styles.golferBackBtn} onPress={() => setGameScreen('menu')}>
              <Text style={styles.golferBackBtnText}>← BACK</Text>
            </Pressable>
            <Pressable style={styles.golferSelectBtn} onPress={() => setGameScreen('club-select')}>
              <Text style={styles.golferSelectBtnText}>SELECT →</Text>
            </Pressable>
          </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  // ═══════════════ CLUB SELECT SCREEN ═══════════════
  if (gameScreen === 'club-select') {
    const categories = [
      { key: 'drivers', label: 'Drivers' },
      { key: 'fairwayWoods', label: 'Woods' },
      { key: 'irons', label: 'Irons' },
      { key: 'wedges', label: 'Wedges' },
      { key: 'putters', label: 'Putters' }
    ];
    const categoryItems = EQUIPMENT_CATALOG[bagPickerCategory] || [];
    const bagCount = selectedBag.length;
    const hasPutter = selectedBag.some(id => {
      const eq = getEquipmentById(id);
      return eq && eq.clubKey === 'PT';
    });
    const canProceed = bagCount === 14 && hasPutter;

    const toggleClub = (itemId) => {
      setSelectedBag(prev => {
        if (prev.includes(itemId)) {
          return prev.filter(id => id !== itemId);
        }
        if (prev.length >= 14) return prev; // can't add more
        return [...prev, itemId];
      });
    };

    const statLabels = { distance: 'Dist', accuracy: 'Acc', forgiveness: 'Frgv', spin: 'Spin', feel: 'Feel' };

    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.spaceMenuScreen}>
          <View style={styles.menuStarsLayer} pointerEvents="none">
            {starField.map((star) => <View key={star.key} style={[styles.menuStar, { left: `${star.x}%`, top: `${star.y}%`, width: star.size, height: star.size, opacity: star.opacity }]} />)}
          </View>
          <View style={{ flex: 1, padding: 16 }}>
          <Text style={styles.golferStatsSectionTitle}>BUILD YOUR BAG</Text>
          <Text style={styles.clubSelectCount}>{bagCount}/14 clubs {hasPutter ? '✅' : '⚠️ Need putter'}</Text>

          {/* Category tabs */}
          <View style={styles.clubCategoryTabs}>
            {categories.map(cat => (
              <Pressable
                key={cat.key}
                style={[styles.clubCategoryTab, bagPickerCategory === cat.key && styles.clubCategoryTabActive]}
                onPress={() => setBagPickerCategory(cat.key)}
              >
                <Text style={[styles.clubCategoryTabText, bagPickerCategory === cat.key && styles.clubCategoryTabTextActive]}>{cat.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Club list */}
          <ScrollView style={styles.clubListScroll} showsVerticalScrollIndicator={false}>
            {categoryItems.map(item => {
              const inBag = selectedBag.includes(item.id);
              const clubData = CLUBS.find(c => c.key === item.clubKey);
              return (
                <Pressable
                  key={item.id}
                  style={[styles.clubItemCard, inBag && styles.clubItemCardSelected]}
                  onPress={() => toggleClub(item.id)}
                >
                  <View style={styles.clubItemHeader}>
                    <Text style={styles.clubItemName}>{item.name}</Text>
                    <Text style={styles.clubItemBrand}>{item.brand}</Text>
                    {clubData ? <Text style={styles.clubItemCarry}>{clubData.carryYards}yd</Text> : null}
                  </View>
                  <View style={styles.clubItemStats}>
                    {Object.entries(item.stats).map(([key, val]) => (
                      <View key={key} style={styles.clubStatRow}>
                        <Text style={styles.clubStatName}>{statLabels[key] || key}</Text>
                        <View style={styles.clubStatBarBg}>
                          <View style={[styles.clubStatBarFill, { width: `${val}%`, backgroundColor: val >= 70 ? '#4ade80' : val >= 40 ? '#fbbf24' : '#ef4444' }]} />
                        </View>
                        <Text style={styles.clubStatValue}>{val}</Text>
                      </View>
                    ))}
                  </View>
                  {inBag ? <Text style={styles.clubItemCheck}>✅</Text> : <Text style={styles.clubItemAdd}>+</Text>}
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.golferNavRow}>
            <Pressable style={styles.golferBackBtn} onPress={() => setGameScreen('golfer-select')}>
              <Text style={styles.golferBackBtnText}>← GOLFER</Text>
            </Pressable>
            <Pressable
              style={[styles.golferSelectBtn, !canProceed && styles.disabled]}
              disabled={!canProceed}
              onPress={() => setGameScreen('courses')}
            >
              <Text style={styles.golferSelectBtnText}>PLAY →</Text>
            </Pressable>
          </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (gameScreen === 'courses') {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.spaceMenuScreen}>
          <View style={styles.menuStarsLayer} pointerEvents="none">
            {starField.map((star) => (
              <View
                key={`${star.key}-courses`}
                style={[
                  styles.menuStar,
                  {
                    left: star.left,
                    top: star.top,
                    width: star.size,
                    height: star.size,
                    backgroundColor: star.color,
                    opacity: star.opacity
                  }
                ]}
              />
            ))}
          </View>
          <View style={styles.menuGreenGlow} pointerEvents="none" />

          <View style={styles.coursesContentWrap}>
            <Text style={styles.menuDataBar}>◂ EST. 2155 · 14 SPECIES · 9 STAR SYSTEMS ▸</Text>
            <Text style={styles.coursesTitle}>SELECT COURSE</Text>

            <ScrollView
              style={styles.courseMenuList}
              contentContainerStyle={styles.coursesListContent}
              showsVerticalScrollIndicator={false}
            >
              {COURSES.map((course, index) => (
                <Pressable
                  key={course.id}
                  style={({ pressed }) => [
                    styles.spaceCourseCard,
                    selectedCourseIndex === index && styles.spaceCourseCardActive,
                    pressed && styles.spaceCourseCardPressed
                  ]}
                  onPress={() => setSelectedCourseIndex(index)}
                >
                  <View style={styles.spaceCourseHeader}>
                    <Text style={styles.spaceCourseTitle}>{course.name}</Text>
                    <Text style={styles.spaceCourseDifficulty}>{course.difficulty}</Text>
                  </View>
                  <Text style={styles.spaceCourseDesigner}>DESIGNER · {course.designer.toUpperCase()}</Text>
                  <Text style={styles.spaceCourseDescription}>{course.description}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable style={styles.coursesPlayButton} onPress={() => startCourse(selectedCourseIndex)}>
              <Text style={styles.coursesPlayButtonText}>PLAY</Text>
            </Pressable>
            <Pressable style={styles.coursesBackButton} onPress={() => setGameScreen('menu')}>
              <Text style={styles.coursesBackButtonText}>BACK</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (gameScreen === 'settings') {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.spaceMenuScreen}>
          <View style={styles.menuStarsLayer} pointerEvents="none">
            {starField.map((star) => (
              <View key={`${star.key}-set`} style={[styles.menuStar, { left: star.left, top: star.top, width: star.size, height: star.size, backgroundColor: star.color, opacity: star.opacity }]} />
            ))}
          </View>
          <View style={styles.menuGreenGlow} pointerEvents="none" />
          <View style={styles.coursesContentWrap}>
            <Text style={styles.menuDataBar}>◂ INTERGALACTIC GOLF TOUR ▸</Text>
            <Text style={styles.coursesTitle}>SETTINGS</Text>
            <View style={{ gap: 12, marginTop: 20 }}>
              <Pressable style={styles.spaceMenuBtnActive} onPress={() => setGameScreen('backstory-read')}>
                <Text style={styles.spaceMenuBtnLeft}>📜 READ BACKSTORY</Text>
                <Text style={styles.spaceMenuBtnRight}>&gt;</Text>
                <View style={[styles.lCorner, styles.lCornerTopLeft]} />
                <View style={[styles.lCorner, styles.lCornerTopRight]} />
                <View style={[styles.lCorner, styles.lCornerBottomLeft]} />
                <View style={[styles.lCorner, styles.lCornerBottomRight]} />
              </Pressable>
              <Pressable style={styles.spaceMenuBtnActive} onPress={() => setGameScreen('backstory-listen')}>
                <Text style={styles.spaceMenuBtnLeft}>🎧 LISTEN TO BACKSTORY</Text>
                <Text style={styles.spaceMenuBtnRight}>&gt;</Text>
                <View style={[styles.lCorner, styles.lCornerTopLeft]} />
                <View style={[styles.lCorner, styles.lCornerTopRight]} />
                <View style={[styles.lCorner, styles.lCornerBottomLeft]} />
                <View style={[styles.lCorner, styles.lCornerBottomRight]} />
              </Pressable>
            </View>
            <View style={{ flex: 1 }} />
            <Pressable style={styles.coursesBackButton} onPress={() => setGameScreen('menu')}>
              <Text style={styles.coursesBackButtonText}>BACK</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (gameScreen === 'backstory-read') {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.spaceMenuScreen}>
          <View style={styles.menuStarsLayer} pointerEvents="none">
            {starField.map((star) => (
              <View key={`${star.key}-br`} style={[styles.menuStar, { left: star.left, top: star.top, width: star.size, height: star.size, backgroundColor: star.color, opacity: star.opacity }]} />
            ))}
          </View>
          <View style={styles.menuGreenGlow} pointerEvents="none" />
          <View style={styles.coursesContentWrap}>
            <Text style={styles.menuDataBar}>◂ INTERGALACTIC GOLF TOUR ▸</Text>
            <Text style={styles.coursesTitle}>THE BACKSTORY</Text>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {BACKSTORY_PARAGRAPHS.map((para, i) => (
                <Text key={`bp-${i}`} style={{ color: i === 0 ? '#88F8BB' : i === BACKSTORY_PARAGRAPHS.length - 1 ? '#88F8BB' : '#d5e7cd', fontSize: i === 0 || i === BACKSTORY_PARAGRAPHS.length - 1 ? 16 : 14, lineHeight: 22, marginBottom: 16, fontWeight: i === 0 || i === BACKSTORY_PARAGRAPHS.length - 1 ? '700' : '400', fontStyle: i === 0 ? 'italic' : 'normal' }}>{para}</Text>
              ))}
            </ScrollView>
            <Pressable style={styles.coursesBackButton} onPress={() => setGameScreen('settings')}>
              <Text style={styles.coursesBackButtonText}>BACK</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (gameScreen === 'backstory-listen') {
    const audioRef = { current: typeof window !== 'undefined' ? (window.__igtAudio || (window.__igtAudio = new Audio('/backstory.mp3'))) : null };
    const startSpeech = () => {
      if (!audioRef.current) return;
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      setIsSpeaking(true);
      setSpeechPaused(false);
      audioRef.current.onended = () => { setIsSpeaking(false); setSpeechPaused(false); };
    };
    const pauseSpeech = () => {
      if (audioRef.current) { audioRef.current.pause(); setSpeechPaused(true); }
    };
    const resumeSpeech = () => {
      if (audioRef.current) { audioRef.current.play(); setSpeechPaused(false); }
    };
    const stopSpeech = () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; setIsSpeaking(false); setSpeechPaused(false); }
    };
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.spaceMenuScreen}>
          <View style={styles.menuStarsLayer} pointerEvents="none">
            {starField.map((star) => (
              <View key={`${star.key}-bl`} style={[styles.menuStar, { left: star.left, top: star.top, width: star.size, height: star.size, backgroundColor: star.color, opacity: star.opacity }]} />
            ))}
          </View>
          <View style={styles.menuGreenGlow} pointerEvents="none" />
          <View style={[styles.coursesContentWrap, { alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={styles.menuDataBar}>◂ INTERGALACTIC GOLF TOUR ▸</Text>
            <Text style={styles.coursesTitle}>🎧 LISTEN</Text>
            <View style={{ alignItems: 'center', gap: 20, marginTop: 30 }}>
              <View style={{ width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: '#88F8BB', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(136,248,187,0.08)' }}>
                <Text style={{ fontSize: 40 }}>{isSpeaking && !speechPaused ? '🔊' : '🎧'}</Text>
              </View>
              <Text style={{ color: '#A0A0A0', fontSize: 13, letterSpacing: 2 }}>
                {isSpeaking ? (speechPaused ? 'PAUSED' : 'PLAYING...') : 'READY'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {!isSpeaking ? (
                  <Pressable style={[styles.coursesPlayButton, { width: 140, marginTop: 0 }]} onPress={startSpeech}>
                    <Text style={styles.coursesPlayButtonText}>▶ PLAY</Text>
                  </Pressable>
                ) : (
                  <>
                    {speechPaused ? (
                      <Pressable style={[styles.coursesPlayButton, { width: 110, marginTop: 0 }]} onPress={resumeSpeech}>
                        <Text style={styles.coursesPlayButtonText}>▶ RESUME</Text>
                      </Pressable>
                    ) : (
                      <Pressable style={[styles.coursesPlayButton, { width: 110, marginTop: 0, backgroundColor: '#f0c040' }]} onPress={pauseSpeech}>
                        <Text style={[styles.coursesPlayButtonText, { color: '#05070A' }]}>⏸ PAUSE</Text>
                      </Pressable>
                    )}
                    <Pressable style={[styles.coursesBackButton, { width: 110, marginTop: 0, borderColor: '#ef4444' }]} onPress={stopSpeech}>
                      <Text style={[styles.coursesBackButtonText, { color: '#ef4444' }]}>⏹ STOP</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
            <View style={{ flex: 1 }} />
            <Pressable style={styles.coursesBackButton} onPress={() => { stopSpeech(); setGameScreen('settings'); }}>
              <Text style={styles.coursesBackButtonText}>BACK</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.courseShell}>
        <View
          ref={courseRef}
          onLayout={syncCourseFrame}
          style={[styles.course, { width: viewWidth, height: viewHeight }]}
        >
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none" {...aimResponder.panHandlers}>
            <View style={styles.courseTintTop} pointerEvents="none" />
            <View style={styles.courseTintBottom} pointerEvents="none" />

          <View
            style={[
              styles.worldLayer,
              {
                left: worldOffsetX,
                top: worldOffsetY,
                width: WORLD.w * scaleX,
                height: WORLD.h * scaleY
              }
            ]}
          >
            {currentHole.terrain?.fairway?.map((f, i) => (
              <View
                key={`fair-${i}`}
                style={[
                  styles.fairway,
                  {
                    left: f.x * scaleX,
                    top: f.y * scaleY,
                    width: f.w * scaleX,
                    height: f.h * scaleY,
                    borderRadius: (f.r || 8) * scaleX
                  }
                ]}
              >
                <View style={styles.fairwaySheen} />
              </View>
            ))}

            {currentHole.terrain?.green ? (
              <>
                <View
                  style={[
                    styles.fringe,
                    {
                      left: (currentHole.terrain.green.x - FRINGE_BUFFER) * scaleX,
                      top: (currentHole.terrain.green.y - FRINGE_BUFFER) * scaleY,
                      width: (currentHole.terrain.green.w + FRINGE_BUFFER * 2) * scaleX,
                      height: (currentHole.terrain.green.h + FRINGE_BUFFER * 2) * scaleY,
                      borderRadius: (currentHole.terrain.green.r + FRINGE_BUFFER) * scaleX
                    }
                  ]}
                />
                <View
                  style={[
                    styles.green,
                    {
                      left: currentHole.terrain.green.x * scaleX,
                      top: currentHole.terrain.green.y * scaleY,
                      width: currentHole.terrain.green.w * scaleX,
                      height: currentHole.terrain.green.h * scaleY,
                      borderRadius: currentHole.terrain.green.r * scaleX
                    }
                  ]}
                />
                {puttingMode ? slopeArrows.map((arrow) => (
                  <Text
                    key={arrow.key}
                    pointerEvents="none"
                    style={[
                      styles.slopeArrowText,
                      {
                        left: arrow.x * scaleX - 5,
                        top: arrow.y * scaleY - 9,
                        opacity: arrow.opacity ?? 0.7
                      }
                    ]}
                  >
                    {arrow.char}
                  </Text>
                )) : null}
              </>
            ) : null}

            {currentHole.terrain?.tee ? (
              <View
                style={[
                  styles.tee,
                  {
                    left: currentHole.terrain.tee.x * scaleX,
                    top: currentHole.terrain.tee.y * scaleY,
                    width: currentHole.terrain.tee.w * scaleX,
                    height: currentHole.terrain.tee.h * scaleY,
                    borderRadius: currentHole.terrain.tee.r * scaleX
                  }
                ]}
              />
            ) : null}

            {currentHole.hazards.map((h, i) => {
              const common = {
                left: h.x * scaleX,
                top: h.y * scaleY,
                width: h.w * scaleX,
                height: h.h * scaleY
              };

              if (h.type === 'sandRect') {
                return <View key={`haz-${i}`} style={[styles.sand, common]} />;
              }

              if (h.type === 'waterRect') {
                return <View key={`haz-${i}`} style={[styles.water, common]} />;
              }

              return null;
            })}

            {currentHole.obstacles.map((o, i) => {
              if (o.type === 'rect') {
                return (
                  <View
                    key={`obs-${i}`}
                    style={[
                      styles.wall,
                      {
                        left: o.x * scaleX,
                        top: o.y * scaleY,
                        width: o.w * scaleX,
                        height: o.h * scaleY
                      }
                    ]}
                  />
                );
              }

              if (o.type === 'circle') {
                const size = o.r * scaleX * 2;
                return (
                  <View
                    key={`obs-${i}`}
                    style={[
                      o.look === 'tree' ? styles.tree : styles.bumper,
                      {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        left: (o.x - o.r) * scaleX,
                        top: (o.y - o.r) * scaleY
                      }
                    ]}
                  >
                    {o.look === 'tree' ? <View style={styles.treeCore} /> : null}
                  </View>
                );
              }

              return null;
            })}

            {puttingMode && puttAimPoint ? (
              <View
                pointerEvents="none"
                style={[
                  styles.puttAimMarker,
                  {
                    left: puttAimPoint.x * scaleX - 14,
                    top: puttAimPoint.y * scaleY - 14
                  }
                ]}
              >
                <View style={styles.puttAimMarkerH} />
                <View style={styles.puttAimMarkerV} />
              </View>
            ) : null}

            {puttPreview ? (
              <>
                {puttPreviewDots.map((dot) => (
                  <View
                    key={dot.key}
                    pointerEvents="none"
                    style={[
                      styles.puttPreviewDot,
                      {
                        width: dot.size,
                        height: dot.size,
                        borderRadius: dot.size / 2,
                        left: dot.point.x * scaleX - dot.size / 2,
                        top: dot.point.y * scaleY - dot.size / 2,
                        opacity: dot.opacity
                      }
                    ]}
                  />
                ))}
                <View
                  pointerEvents="none"
                  style={[
                    styles.puttPreviewFinal,
                    {
                      left: puttPreview.finalPos.x * scaleX - 7,
                      top: puttPreview.finalPos.y * scaleY - 7
                    }
                  ]}
                />
              </>
            ) : null}
          </View>

          {!ballMoving && !sunk ? aimLineDots.map((dot) => (
            <View
              key={dot.key}
              pointerEvents="none"
              style={[
                styles.aimDot,
                {
                  width: dot.size,
                  height: dot.size,
                  borderRadius: dot.size / 2,
                  left: dot.x - dot.size / 2,
                  top: dot.y - dot.size / 2,
                  opacity: dot.opacity,
                  backgroundColor: dot.color
                }
              ]}
            />
          )) : null}

          <View
            style={[
              styles.cup,
              {
                width: cupRadius * 2,
                height: cupRadius * 2,
                borderRadius: cupRadius,
                left: screenCup.x - cupRadius,
                top: screenCup.y - cupRadius
              }
            ]}
          />

          <View
            pointerEvents="none"
            style={[
              styles.golferWrap,
              {
                width: golferWidth,
                height: golferHeight,
                left: golferAnchor.x - golferWidth / 2,
                top: golferAnchor.y - golferHeight / 2,
                transform: [{ rotate: `${golferAngle}deg` }]
              }
            ]}
          >
            {GOLFER_PIXELS.map((pixel, i) => (
              <View
                key={`golfer-px-${i}`}
                style={[
                  styles.golferPixel,
                  {
                    width: golferPixelSize,
                    height: golferPixelSize,
                    left: pixel.x * golferPixelSize,
                    top: pixel.y * golferPixelSize,
                    backgroundColor: pixel.color
                  }
                ]}
              />
            ))}
          </View>

          {/* Shot Tracer */}
          {shotTracer.length > 1 ? shotTracer.map((pt, i) => {
            const sx = (pt.x - cameraRef.current.x) * pixelsPerWorld + viewWidth / 2;
            const sy = (pt.y - cameraRef.current.y) * pixelsPerWorld + viewHeight / 2 - (pt.z || 0) * pixelsPerWorld * 0.35;
            const age = (shotTracer.length - 1 - i) / Math.max(1, shotTracer.length - 1);
            const opacity = Math.max(0.06, 0.95 - age * 0.9);
            return (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: sx - 1,
                  top: sy - 1,
                  width: 2.5,
                  height: 2.5,
                  borderRadius: 1.25,
                  backgroundColor: '#ffd700',
                  opacity
                }}
              />
            );
          }) : null}

          {!sunk ? (
            <>
              <View
                style={[
                  styles.ballShadow,
                  {
                    width: ballRadius * 2.05,
                    height: ballRadius * 1.15,
                    borderRadius: ballRadius,
                    left: screenBall.x - ballRadius * 1.02,
                    top: screenBall.y - ballRadius * 0.46,
                    opacity: Math.max(0.08, shadowOpacity),
                    transform: [{ scaleX: shadowScale }, { scaleY: shadowScale * 0.96 }]
                  }
                ]}
              />

              <View
                style={[
                  styles.ball,
                  {
                    width: ballRadius * 2,
                    height: ballRadius * 2,
                    borderRadius: ballRadius,
                    left: screenBall.x - ballRadius,
                    top: screenBall.y - ballRadius - liftPx,
                    transform: [{ scale: ballVisualScale }]
                  }
                ]}
              />
            </>
          ) : null}
          </View>
        </View>

        <View style={styles.topOverlay} pointerEvents="box-none">
          <View style={styles.versionWrap} pointerEvents="none">
            <Text style={styles.versionText}>{BUILD_VERSION}</Text>
          </View>
          <View style={styles.topHudRow}>
            <View style={styles.menuWrap}>
              <Pressable style={styles.menuButton} onPress={() => setMenuOpen((v) => !v)}>
                <Text style={styles.menuIcon}>☰</Text>
              </Pressable>
              {menuOpen ? (
                <View style={styles.menuPanel}>
                  <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); retryHole(); }}>
                    <Text style={styles.menuItemText}>Retry Hole</Text>
                  </Pressable>
                  <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); resetBall({ penaltyStroke: true }); }}>
                    <Text style={styles.menuItemText}>Quick Reset</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.menuItem, holeIndex === 0 && styles.disabled]}
                    disabled={holeIndex === 0}
                    onPress={() => {
                      setMenuOpen(false);
                      setHoleIndex((h) => Math.max(0, h - 1));
                    }}
                  >
                    <Text style={styles.menuItemText}>Prev Hole</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.menuItem, !sunk && styles.disabled]}
                    disabled={!sunk}
                    onPress={() => {
                      setMenuOpen(false);
                      goToNextHole();
                    }}
                  >
                    <Text style={styles.menuItemText}>{isLastHole ? 'Round Done' : 'Next Hole'}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.menuItem, styles.menuItemDanger]}
                    onPress={backToMenu}
                  >
                    <Text style={styles.menuItemText}>Back to Menu</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <View style={styles.hudStrip}>
              <View style={styles.hudItem}>
                <Text style={styles.hudLabel}>Hole</Text>
                <Text style={styles.hudValue}>{safeHoleIndex + 1} / {ACTIVE_HOLES.length}</Text>
              </View>
              <View style={styles.hudItem}>
                <Text style={styles.hudLabel}>Par</Text>
                <Text style={styles.hudValue}>{currentHole.par}</Text>
              </View>
              <View style={styles.hudItem}>
                <Text style={styles.hudLabel}>Shot</Text>
                <Text style={styles.hudValue}>{shotNumber}</Text>
              </View>
              <Pressable
                style={[
                  styles.hudItem,
                  styles.hudItemPressable,
                  shotControlOpen && styles.hudItemActive,
                  puttingMode && styles.disabled
                ]}
                disabled={puttingMode}
                onPress={() => {
                  setShotControlOpen((v) => !v);
                  setLastShotNote('Shot shape opened from yardage. Drag the blue dot, then tap the ball to hit.');
                }}
              >
                <Text style={styles.hudLabel}>Yards</Text>
                <Text style={styles.hudValue}>{yardsToCup}</Text>
              </Pressable>
              {puttingMode ? (
                <View style={styles.hudItemPutting}>
                  <Text style={styles.hudPuttingText}>PUTTING</Text>
                </View>
              ) : null}
              <View style={styles.hudItem}>
                <Text style={styles.hudLabel}>Wind</Text>
                <Text style={styles.hudValue}>{windLabel}</Text>
              </View>
              <View style={styles.hudItemWind}>
                <Text style={styles.windArrow}>{windArrow}</Text>
                <Text style={styles.windDirText}>{windDirLabel}</Text>
              </View>
            </View>
          </View>
        </View>


        <View style={styles.bottomOverlay}>
          <View style={styles.bottomMainRow}>
            <Pressable
              style={[styles.clubCard, shotControlOpen && styles.clubCardActive]}
              onPress={() => {
                if (puttingMode) {
                  return;
                }
                setShotControlOpen(true);
                setLastShotNote('Shot shape opened. Drag the blue dot, then tap the ball to hit.');
              }}
            >
              <Text style={styles.clubCardTitle}>{selectedClub.name}</Text>
              <Text style={styles.clubCardSub}>{selectedClub.short} • {shotShape}</Text>
              <Text style={styles.clubCardYards}>{previewYards} yd</Text>
              <Text style={styles.clubCardMeta}>Stock {stockClubYards} • To pin {yardsToCup}</Text>
              <Text style={styles.clubCardMeta}>{puttingMode ? `Target: ${puttTargetText}` : tempoLabel}</Text>
              {puttingMode ? <Text style={styles.clubCardMeta}>{puttStatusText}</Text> : null}
            </Pressable>

            <View style={styles.swingDock}>
              {shotControlOpen && !puttingMode ? (
                <View style={[styles.swingPad, styles.swingPadActive]}>
                  <View style={styles.shotPadGuideWrap} {...shotControlResponder.panHandlers}>
                    <View style={styles.shotPadCrosshairH} pointerEvents="none" />
                    <View style={styles.shotPadCrosshairV} pointerEvents="none" />
                    <View
                      pointerEvents="none"
                      style={[
                        styles.spinDot,
                        draggingSpinDot && styles.spinDotActive,
                        {
                          left: PAD_CENTER + spinOffset.x - SPIN_DOT_RADIUS,
                          top: PAD_CENTER + spinOffset.y - SPIN_DOT_RADIUS
                        }
                      ]}
                    />
                  </View>
                  <Pressable
                    style={styles.shotDoneButton}
                    onPress={() => {
                      setShotControlOpen(false);
                      setLastShotNote('Shot shape set. Tap Hit to strike the ball.');
                    }}
                  >
                    <Text style={styles.shotDoneText}>Done</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.swingPad} {...swingResponder.panHandlers}>
                  {/* Radial power ring */}
                  <View style={[
                    styles.powerRing,
                    {
                      width: SHOT_PAD_SIZE * clamp(powerPct / 100, 0.15, 1.2),
                      height: SHOT_PAD_SIZE * clamp(powerPct / 100, 0.15, 1.2),
                      borderRadius: SHOT_PAD_SIZE * clamp(powerPct / 100, 0.15, 1.2) / 2,
                      borderColor: powerPct > 100 ? '#ff4444' : '#4adb6a',
                      opacity: swingPhase !== 'idle' ? 0.7 : 0.25
                    }
                  ]} />
                  <View style={styles.swingHaloOuter} />
                  <View style={styles.swingHaloInner}>
                    <Text style={styles.swingPct}>
                      {swingPhase === 'backswing' ? `${powerPct}%`
                        : swingPhase === 'forward' ? (Math.abs(swingDeviation) < 0.1 ? '↑' : swingDeviation < 0 ? '↰' : '↱')
                        : '⛳'}
                    </Text>
                  </View>
                  {/* Swing guide */}
                  {swingPhase !== 'idle' ? (
                    <View style={styles.swingGuideWrap} pointerEvents="none">
                      <Text style={styles.swingGuideText}>
                        {swingPhase === 'backswing'
                          ? '↓ Pull down for power'
                          : puttingMode
                            ? '↑ Swipe up straight, release to hit'
                            : `Swipe up straight! ${Math.abs(swingDeviation) < 0.1 ? '✓ Straight' : swingDeviation < -0.3 ? '← Pull' : swingDeviation > 0.3 ? '→ Push' : swingDeviation < 0 ? '← Slight' : '→ Slight'}`}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.swingGuideWrap} pointerEvents="none">
                      <Text style={styles.swingGuideText}>{puttingMode ? 'Pull down, then swipe up to putt' : 'Hold & drag down'}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>

          {puttingMode ? (
            <View style={styles.puttCompactBar}>
              <Pressable
                style={styles.puttChipToggle}
                onPress={() => {
                  setPuttingMode(false);
                  setPuttPreview(null);
                  setPuttAimPoint(null);
                  setPuttSimulated(false);
                  setPuttTargetPowerPct(null);
                  setPuttSwingFeedback('');
                  setSelectedClubIndex(1); // switch to LW for chip
                }}
              >
                <Text style={styles.puttChipToggleText}>🏌️ Chip</Text>
              </Pressable>
              <View style={styles.puttCompactInfo}>
                <Text style={styles.puttCompactTarget}>Target: {puttTargetText}</Text>
                <Text style={styles.puttCompactSub}>{puttStatusText}</Text>
              </View>
              <Pressable
                style={[
                  styles.puttCompactSimBtn,
                  (!puttAimPoint || sunk || ballMoving || puttSimulated) && styles.disabled
                ]}
                disabled={!puttAimPoint || sunk || ballMoving || puttSimulated}
                onPress={handleSimulatePutt}
              >
                <Text style={styles.puttCompactSimText}>Simulate</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {(currentLie === 'green' || currentLie === 'fringe') && !ballMoving && !sunk ? (
                <Pressable
                  style={styles.puttToggleBtn}
                  onPress={() => {
                    setPuttingMode(true);
                    setSelectedClubIndex(0);
                    setShotControlOpen(false);
                    setSpinOffset({ x: 0, y: 0 });
                    setPuttPreview(null);
                    setPuttAimPoint(null);
                    setPuttSimulated(false);
                    setPuttTargetPowerPct(null);
                    setPuttSwingFeedback('');
                    setTempoLabel('Place aim point');
                  }}
                >
                  <Text style={styles.puttToggleBtnText}>⛳ Switch to Putt</Text>
                </Pressable>
              ) : null}
              <View style={styles.clubSelectorWrap}>
                <Pressable
                  style={styles.clubPickerTrigger}
                  onPress={() => setClubPickerOpen((v) => !v)}
                >
                  <Text style={styles.clubPickerTriggerLabel}>Club</Text>
                  <Text style={styles.clubPickerTriggerValue}>{selectedClub.short} • {selectedClub.name}</Text>
                  <Text style={styles.clubPickerTriggerChevron}>{clubPickerOpen ? '▲' : '▼'}</Text>
                </Pressable>

                {clubPickerOpen ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clubScrollContent}>
                    {CLUBS.map((club, index) => (
                      <Pressable
                        key={club.key}
                        style={[styles.clubChip, index === selectedClubIndex && styles.clubChipActive]}
                        onPress={() => {
                          setSelectedClubIndex(index);
                          setClubPickerOpen(false);
                        }}
                      >
                        <Text style={[styles.clubChipText, index === selectedClubIndex && styles.clubChipTextActive]}>
                          {club.short}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
              </View>

              <Text style={styles.helperText}>
                {isAiming
                  ? 'Adjusting aim...'
                  : showScorecard
                    ? 'Review your scorecard to continue.'
                    : shotControlOpen
                    ? 'Drag the blue dot, then tap Shoot to hit.'
                    : Platform.OS === 'web'
                      ? 'Tap Yards, the club card, or Hit to open shot shaping. Drag on the course to pan, tap to aim.'
                      : 'Tap Yards, the club card, or Hit to open shot shaping. Use two fingers on course to pan camera.'}
              </Text>
            </>
          )}

          {waterNotice && !sunk && !waterDropMenu ? <Text style={styles.warning}>Water hazard: +1 stroke penalty.</Text> : null}
        </View>

        {/* Ball Lie PiP */}
        {!sunk && !ballMoving ? (
          <View style={styles.liePip}>
            <View style={[styles.lieColorBar, { backgroundColor: (SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough).color }]} />
            <Text style={styles.lieEmoji}>{(SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough).emoji}</Text>
            <Text style={styles.lieLabel}>{(SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough).label}</Text>
            {((SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough).powerPenalty[1]) < 1 ? (
              <Text style={styles.liePenalty}>{Math.round((SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough).powerPenalty[0] * 100)}-{Math.round((SURFACE_PHYSICS[currentLie] || SURFACE_PHYSICS.rough).powerPenalty[1] * 100)}% power</Text>
            ) : null}
          </View>
        ) : null}

        {/* Water Drop Menu */}
        {waterDropMenu ? (
          <View style={styles.scorecardOverlay}>
            <View style={[styles.scorecardCard, { maxWidth: 320, gap: 12 }]}>
              <Text style={styles.scorecardTitle}>💧 Penalty Area</Text>
              <Text style={{ color: '#c8dfc4', fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                Ball in water. +1 stroke penalty.{"\n"}Choose your relief option:
              </Text>
              <Pressable
                style={[styles.nextHoleBtn, { backgroundColor: '#3a8a5a', paddingVertical: 12 }]}
                onPress={() => handleWaterDrop(waterDropMenu.entryPos)}
              >
                <Text style={styles.nextHoleBtnText}>⛳ Lateral Drop (near water edge)</Text>
              </Pressable>
              <Pressable
                style={[styles.nextHoleBtn, { backgroundColor: '#5a7a3a', paddingVertical: 12 }]}
                onPress={() => handleWaterDrop(waterDropMenu.lastPos)}
              >
                <Text style={styles.nextHoleBtnText}>🔄 Stroke & Distance (re-hit from last spot)</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {showScorecard ? (
          <View style={styles.scorecardOverlay}>
            <View style={styles.scorecardCard}>
              <Text style={styles.scorecardTitle}>{isLastHole ? 'Round Complete!' : 'IGT Scorecard'}</Text>
              {/* Horizontal scorecard — holes as columns, rows for labels/par/score */}
              <ScrollView horizontal style={styles.scorecardScrollH} showsHorizontalScrollIndicator={false}>
                <View style={styles.scorecardTable}>
                  {/* Hole numbers row */}
                  <View style={styles.scorecardTableRow}>
                    <View style={styles.scorecardLabelCell}><Text style={styles.scorecardLabelText}>Hole</Text></View>
                    {frontNine.map((row) => (
                      <View key={`h-${row.hole}`} style={[styles.scorecardDataCell, row.hole === holeIndex + 1 && styles.scorecardDataCellActive]}>
                        <Text style={styles.scorecardDataText}>{row.hole}</Text>
                      </View>
                    ))}
                    {ACTIVE_HOLES.length >= 9 && <View style={styles.scorecardTotalCell}><Text style={styles.scorecardTotalCellText}>OUT</Text></View>}
                    {backNine && backNine.map((row) => (
                      <View key={`h-${row.hole}`} style={[styles.scorecardDataCell, row.hole === holeIndex + 1 && styles.scorecardDataCellActive]}>
                        <Text style={styles.scorecardDataText}>{row.hole}</Text>
                      </View>
                    ))}
                    {backNine && <View style={styles.scorecardTotalCell}><Text style={styles.scorecardTotalCellText}>IN</Text></View>}
                    <View style={styles.scorecardTotalCell}><Text style={styles.scorecardTotalCellText}>TOT</Text></View>
                  </View>
                  {/* Par row */}
                  <View style={styles.scorecardTableRow}>
                    <View style={styles.scorecardLabelCell}><Text style={styles.scorecardLabelText}>Par</Text></View>
                    {frontNine.map((row) => (
                      <View key={`p-${row.hole}`} style={styles.scorecardDataCell}><Text style={styles.scorecardDataText}>{row.par}</Text></View>
                    ))}
                    {ACTIVE_HOLES.length >= 9 && <View style={styles.scorecardTotalCell}><Text style={styles.scorecardTotalCellText}>{sumPar(frontNine)}</Text></View>}
                    {backNine && backNine.map((row) => (
                      <View key={`p-${row.hole}`} style={styles.scorecardDataCell}><Text style={styles.scorecardDataText}>{row.par}</Text></View>
                    ))}
                    {backNine && <View style={styles.scorecardTotalCell}><Text style={styles.scorecardTotalCellText}>{sumPar(backNine)}</Text></View>}
                    <View style={styles.scorecardTotalCell}><Text style={styles.scorecardTotalCellText}>{sumPar(scorecardRows)}</Text></View>
                  </View>
                  {/* Score row */}
                  <View style={styles.scorecardTableRow}>
                    <View style={styles.scorecardLabelCell}><Text style={styles.scorecardLabelText}>Score</Text></View>
                    {frontNine.map((row) => {
                      const played = row.strokes !== null;
                      const shape = played ? getScoreShape(row.strokes, row.par) : null;
                      return (
                        <View key={`s-${row.hole}`} style={[styles.scorecardDataCell, row.hole === holeIndex + 1 && styles.scorecardDataCellActive]}>
                          {!played ? <Text style={styles.scorecardUnplayed}>—</Text>
                           : shape === 'eagle' ? <View style={styles.scoreBadgeDoubleOuter}><View style={styles.scoreBadgeDoubleInner}><Text style={styles.scoreBadgeText}>{row.strokes}</Text></View></View>
                           : shape === 'birdie' ? <View style={styles.scoreBadgeSingleCircle}><Text style={styles.scoreBadgeText}>{row.strokes}</Text></View>
                           : shape === 'bogey' ? <View style={styles.scoreBadgeSingleSquare}><Text style={styles.scoreBadgeText}>{row.strokes}</Text></View>
                           : shape === 'doubleBogey' ? <View style={styles.scoreBadgeDoubleSquareOuter}><View style={styles.scoreBadgeDoubleSquareInner}><Text style={styles.scoreBadgeText}>{row.strokes}</Text></View></View>
                           : shape === 'tripleBogey' ? <View style={styles.scoreBadgeSolidSquare}><Text style={styles.scoreBadgeSolidText}>{row.strokes}</Text></View>
                           : <Text style={styles.scorecardDataText}>{row.strokes}</Text>}
                        </View>
                      );
                    })}
                    {ACTIVE_HOLES.length >= 9 && <View style={styles.scorecardTotalCell}><Text style={styles.scorecardTotalCellText}>{sumStrokes(frontNine.filter(r => r.strokes !== null)) || '—'}</Text></View>}
                    {backNine && backNine.map((row) => {
                      const played = row.strokes !== null;
                      const shape = played ? getScoreShape(row.strokes, row.par) : null;
                      return (
                        <View key={`s-${row.hole}`} style={[styles.scorecardDataCell, row.hole === holeIndex + 1 && styles.scorecardDataCellActive]}>
                          {!played ? <Text style={styles.scorecardUnplayed}>—</Text>
                           : shape === 'eagle' ? <View style={styles.scoreBadgeDoubleOuter}><View style={styles.scoreBadgeDoubleInner}><Text style={styles.scoreBadgeText}>{row.strokes}</Text></View></View>
                           : shape === 'birdie' ? <View style={styles.scoreBadgeSingleCircle}><Text style={styles.scoreBadgeText}>{row.strokes}</Text></View>
                           : shape === 'bogey' ? <View style={styles.scoreBadgeSingleSquare}><Text style={styles.scoreBadgeText}>{row.strokes}</Text></View>
                           : shape === 'doubleBogey' ? <View style={styles.scoreBadgeDoubleSquareOuter}><View style={styles.scoreBadgeDoubleSquareInner}><Text style={styles.scoreBadgeText}>{row.strokes}</Text></View></View>
                           : shape === 'tripleBogey' ? <View style={styles.scoreBadgeSolidSquare}><Text style={styles.scoreBadgeSolidText}>{row.strokes}</Text></View>
                           : <Text style={styles.scorecardDataText}>{row.strokes}</Text>}
                        </View>
                      );
                    })}
                    {backNine && <View style={styles.scorecardTotalCell}><Text style={styles.scorecardTotalCellText}>{sumStrokes(backNine.filter(r => r.strokes !== null)) || '—'}</Text></View>}
                    <View style={styles.scorecardTotalCell}><Text style={[styles.scorecardTotalCellText, scorecardDiffStyle]}>{scorecardTotalStrokes || '—'}</Text></View>
                  </View>
                </View>
              </ScrollView>
              <View style={styles.scorecardTotals}>
                <View style={styles.scorecardTotalRow}>
                  <Text style={styles.scorecardTotalLabel}>{playedRows.length}/{ACTIVE_HOLES.length} played</Text>
                  <Text style={styles.scorecardTotalValue}>{scorecardTotalStrokes || '—'} strokes (par {scorecardTotalPar})</Text>
                  <Text style={[styles.scorecardTotalValue, scorecardDiffStyle, { fontSize: 18 }]}>{scorecardTotalStrokes ? scorecardDiffText : '—'}</Text>
                </View>
              </View>
              {!isLastHole ? (
                <Pressable style={styles.nextHoleBtn} onPress={goToNextHole}>
                  <Text style={styles.nextHoleBtnText}>Next Hole →</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable style={styles.nextHoleBtn} onPress={startNewRound}>
                    <Text style={styles.nextHoleBtnText}>New Round</Text>
                  </Pressable>
                  <Pressable style={styles.chooseCourseBtn} onPress={backToMenu}>
                    <Text style={styles.nextHoleBtnText}>Choose Course</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        ) : null}

        {/* Shot Stats Card */}
        {showShotStats && lastShotStats && !ballMoving ? (
          <Pressable style={styles.shotStatsOverlay} onPress={() => setShowShotStats(false)}>
            <View style={styles.shotStatsCard}>
              <Text style={styles.shotStatsTitle}>📊 Shot Stats</Text>

              {/* Swing Path Visualization */}
              {lastShotStats.swingPath && lastShotStats.swingPath.length > 2 ? (
                <View style={styles.swingPathBox}>
                  <Text style={styles.swingPathLabel}>Swing Path</Text>
                  <View style={styles.swingPathCanvas}>
                    {/* Center line (ideal straight path) */}
                    <View style={styles.swingPathCenterLine} />
                    {/* Draw the swing trail as dots */}
                    {lastShotStats.swingPath.map((pt, i) => {
                      const cx = 60 + pt.x * 55;
                      const cy = 75 + pt.y * 70;
                      const isBack = pt.phase === 'back' || pt.phase === 'start';
                      const size = isBack ? 4 : 5;
                      return (
                        <View
                          key={i}
                          style={{
                            position: 'absolute',
                            left: cx - size / 2,
                            top: cy - size / 2,
                            width: size,
                            height: size,
                            borderRadius: size / 2,
                            backgroundColor: isBack ? '#4adb6a' : '#ffdd44',
                            opacity: 0.4 + (i / lastShotStats.swingPath.length) * 0.6
                          }}
                        />
                      );
                    })}
                    {/* Start dot */}
                    <View style={[styles.swingPathDot, { left: 57, top: 72, backgroundColor: '#fff' }]} />
                  </View>
                  <View style={styles.swingPathLegend}>
                    <View style={styles.swingPathLegendItem}>
                      <View style={[styles.swingPathLegendDot, { backgroundColor: '#4adb6a' }]} />
                      <Text style={styles.swingPathLegendText}>Backswing</Text>
                    </View>
                    <View style={styles.swingPathLegendItem}>
                      <View style={[styles.swingPathLegendDot, { backgroundColor: '#ffdd44' }]} />
                      <Text style={styles.swingPathLegendText}>Forward</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              <View style={styles.shotStatsGrid}>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Club</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.clubName}</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Power</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.power}%</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Carry</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.carry} yds</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Roll</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.roll} yds</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Total</Text>
                  <Text style={[styles.shotStatValue, styles.shotStatTotal]}>{lastShotStats.totalDist} yds</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Peak Height</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.peakHeight} ft</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Contact</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.contact}</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Shape</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.shape}</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Curve</Text>
                  <Text style={styles.shotStatValue}>{lastShotStats.deviationDeg}°</Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Tempo</Text>
                  <Text style={[styles.shotStatValue, lastShotStats.tempoTag === 'Perfect' ? { color: '#88F8BB' } : lastShotStats.tempoTag === 'Rushed' ? { color: '#ef4444' } : lastShotStats.tempoTag === 'Slow' ? { color: '#f0c040' } : null]}>
                    {lastShotStats.tempoTag === 'Perfect' ? '✨ ' : lastShotStats.tempoTag === 'Smooth' ? '👌 ' : lastShotStats.tempoTag === 'Rushed' ? '⚡ ' : lastShotStats.tempoTag === 'Slow' ? '🐢 ' : ''}{lastShotStats.tempoTag || 'Normal'}
                  </Text>
                </View>
                <View style={styles.shotStatRow}>
                  <Text style={styles.shotStatLabel}>Lie</Text>
                  <Text style={styles.shotStatValue}>{(SURFACE_PHYSICS[lastShotStats.endLie] || SURFACE_PHYSICS.rough).emoji} {(SURFACE_PHYSICS[lastShotStats.endLie] || SURFACE_PHYSICS.rough).label}</Text>
                </View>
              </View>
              <Text style={styles.shotStatsDismiss}>Tap to dismiss</Text>
            </View>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#223923'
  },
  aimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 300,
    zIndex: 10
  },
  courseShell: {
    flex: 1
  },
  course: {
    backgroundColor: '#486f3d',
    overflow: 'hidden',
    position: 'relative'
  },
  worldLayer: {
    position: 'absolute',
    backgroundColor: '#2a5220',
    backgroundImage: 'repeating-linear-gradient(55deg, rgba(0,0,0,0.08) 0px, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 9px)'
  },
  courseTintTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '44%',
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  courseTintBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '42%',
    backgroundColor: 'rgba(0,0,0,0.10)'
  },
  tee: {
    position: 'absolute',
    backgroundColor: '#5aad6a',
    backgroundImage: 'repeating-linear-gradient(0deg, transparent 0px, transparent 5px, rgba(255,255,255,0.07) 5px, rgba(255,255,255,0.07) 10px)',
    borderWidth: 2,
    borderColor: '#3a8a4a'
  },
  fairway: {
    position: 'absolute',
    backgroundColor: '#7ab855',
    backgroundImage: 'repeating-linear-gradient(90deg, transparent 0px, transparent 8px, rgba(0,0,0,0.07) 8px, rgba(0,0,0,0.07) 16px)',
    borderWidth: 2,
    borderColor: '#5a9440',
    overflow: 'hidden',
    boxShadow: 'inset 0 0 10px rgba(0,0,0,0.12)'
  },
  fairwaySheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '30%',
    backgroundColor: 'rgba(255,255,255,0.08)'
  },
  green: {
    position: 'absolute',
    backgroundColor: '#4ec96a',
    backgroundImage: 'repeating-linear-gradient(135deg, transparent 0px, transparent 5px, rgba(255,255,255,0.06) 5px, rgba(255,255,255,0.06) 10px)',
    borderWidth: 2,
    borderColor: '#3aaa52',
    boxShadow: 'inset 0 0 18px rgba(0,0,0,0.18)'
  },
  fringe: {
    position: 'absolute',
    backgroundColor: '#5fa048',
    backgroundImage: 'repeating-linear-gradient(90deg, transparent 0px, transparent 6px, rgba(0,0,0,0.05) 6px, rgba(0,0,0,0.05) 12px)'
  },
  slopeArrowText: {
    position: 'absolute',
    fontSize: 14,
    color: 'rgba(255, 255, 180, 0.85)',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  puttAimMarker: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#ff4444',
    backgroundColor: 'rgba(255, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  puttAimMarkerH: {
    position: 'absolute',
    width: 18,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#ff4444'
  },
  puttAimMarkerV: {
    position: 'absolute',
    width: 3,
    height: 18,
    borderRadius: 1.5,
    backgroundColor: '#ff4444'
  },
  puttPreviewDot: {
    position: 'absolute',
    backgroundColor: '#c7f57a',
    borderWidth: 1,
    borderColor: 'rgba(10, 20, 11, 0.42)'
  },
  puttPreviewFinal: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#f4ffcc',
    backgroundColor: 'rgba(137, 225, 92, 0.7)'
  },
  wall: {
    position: 'absolute',
    backgroundColor: '#5a4732',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#3c2d22'
  },
  bumper: {
    position: 'absolute',
    backgroundColor: '#6e5a46',
    borderWidth: 2,
    borderColor: '#4f3f31'
  },
  tree: {
    position: 'absolute',
    backgroundColor: '#2f6e3e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#1f4c28'
  },
  treeCore: {
    width: '45%',
    height: '45%',
    borderRadius: 999,
    backgroundColor: '#214e2b'
  },
  sand: {
    position: 'absolute',
    backgroundColor: '#d4b96a',
    backgroundImage: 'radial-gradient(circle, rgba(180,148,80,0.45) 1px, transparent 1px)',
    backgroundSize: '7px 7px',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#a8843a',
    boxShadow: 'inset 0 3px 10px rgba(120,88,20,0.35)'
  },
  water: {
    position: 'absolute',
    backgroundColor: '#3f88bc',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#26618a'
  },
  aimDot: {
    position: 'absolute',
    backgroundColor: '#ffdd44',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.5)',
    shadowColor: '#ffdd44',
    shadowOpacity: 0.7,
    shadowRadius: 4
  },
  aimDotLabel: {
    position: 'absolute',
    width: 28,
    textAlign: 'center',
    color: 'rgba(245,249,236,0.82)',
    fontSize: 9,
    fontWeight: '700'
  },
  cup: {
    position: 'absolute',
    backgroundColor: '#1b2514',
    borderWidth: 2,
    borderColor: '#091006'
  },
  ball: {
    position: 'absolute',
    backgroundColor: '#fbfbf8',
    borderWidth: 1,
    borderColor: '#ccd2c7'
  },
  ballShadow: {
    position: 'absolute',
    backgroundColor: '#142415'
  },
  golferWrap: {
    position: 'absolute'
  },
  golferPixel: {
    position: 'absolute'
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 80,
    paddingHorizontal: 10,
    paddingTop: 4
  },
  topHudRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  versionWrap: {
    alignItems: 'flex-end',
    marginBottom: 6
  },
  versionText: {
    color: 'rgba(228,239,222,0.72)',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: 'rgba(7, 11, 9, 0.54)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden'
  },
  menuWrap: {
    position: 'relative',
    zIndex: 95
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(8, 12, 10, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  menuIcon: {
    color: '#f6f7f3',
    fontSize: 20,
    fontWeight: '700'
  },
  menuPanel: {
    position: 'absolute',
    top: 48,
    left: 0,
    width: 160,
    borderRadius: 14,
    backgroundColor: 'rgba(7, 11, 9, 0.90)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    padding: 6,
    gap: 4
  },
  menuItem: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)'
  },
  menuItemDanger: {
    marginTop: 4,
    backgroundColor: 'rgba(188, 74, 74, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(225, 133, 133, 0.45)'
  },
  menuItemText: {
    color: '#f2f9ec',
    fontWeight: '700',
    fontSize: 13
  },
  hudStrip: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    backgroundColor: 'rgba(7, 11, 9, 0.64)',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 6,
    paddingVertical: 6
  },
  hudItem: {
    minWidth: 52,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  hudItemWind: {
    minWidth: 42,
    paddingHorizontal: 5,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(80, 140, 220, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(111, 174, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  hudItemPutting: {
    minWidth: 68,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(114, 186, 84, 0.24)',
    borderWidth: 1,
    borderColor: 'rgba(178, 230, 137, 0.62)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  hudPuttingText: {
    color: '#dfffca',
    fontSize: 11,
    fontWeight: '800'
  },
  windArrow: {
    color: '#78b7ff',
    fontSize: 18,
    fontWeight: '800'
  },
  windDirText: {
    color: '#9fc8ff',
    fontSize: 9,
    fontWeight: '700'
  },
  hudItemPressable: {
    borderWidth: 1,
    borderColor: 'rgba(111, 174, 255, 0.28)'
  },
  hudItemActive: {
    backgroundColor: 'rgba(52, 102, 173, 0.28)',
    borderColor: 'rgba(111, 174, 255, 0.9)'
  },
  hudLabel: {
    color: '#9fb59f',
    fontSize: 10,
    fontWeight: '600'
  },
  hudValue: {
    color: '#f5fbef',
    fontSize: 13,
    fontWeight: '700'
  },
  powerRailWrap: {
    position: 'absolute',
    right: 10,
    top: '27%',
    zIndex: 85,
    width: 58,
    alignItems: 'center',
    gap: 4
  },
  powerRailPct: {
    color: '#f5f9f0',
    fontSize: 13,
    fontWeight: '800',
    backgroundColor: 'rgba(6, 10, 8, 0.74)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  powerRailTrack: {
    width: 24,
    height: 204,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(8,12,10,0.78)',
    overflow: 'hidden',
    position: 'relative'
  },
  powerRailSafe: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(106,165,113,0.58)'
  },
  powerRailFill: {
    position: 'absolute',
    left: 3,
    right: 3,
    bottom: 3,
    borderRadius: 10,
    backgroundColor: '#8fd37a'
  },
  powerRailCut: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: `${(100 / 125) * 100}%`,
    height: 2,
    backgroundColor: '#e06f58'
  },
  powerRailMeta: {
    color: '#d2dfcc',
    fontSize: 11,
    fontWeight: '700'
  },
  bottomOverlay: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    zIndex: 90,
    gap: 8
  },
  puttChipToggle: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 6
  },
  puttChipToggleText: {
    color: '#f5fbef',
    fontSize: 12,
    fontWeight: '700'
  },
  puttToggleBtn: {
    backgroundColor: 'rgba(74,158,63,0.3)',
    borderWidth: 1,
    borderColor: '#4a9e3f',
    borderRadius: 8,
    paddingVertical: 8,
    marginHorizontal: 6,
    marginBottom: 4,
    alignItems: 'center'
  },
  puttToggleBtnText: {
    color: '#88F8BB',
    fontSize: 13,
    fontWeight: '800'
  },
  // Golfer select styles
  golferCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16
  },
  golferAvatarWrap: {
    width: 48,
    height: 64,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2
  },
  golferAvatarBlock: {
    width: 24,
    height: 14,
    borderRadius: 3
  },
  golferInfo: {
    flex: 1
  },
  golferName: {
    color: '#f5fbef',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1
  },
  golferSpecies: {
    color: '#88F8BB',
    fontSize: 11,
    marginBottom: 4
  },
  golferBio: {
    color: 'rgba(245,251,239,0.6)',
    fontSize: 12,
    lineHeight: 16
  },
  golferStatsSection: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12
  },
  golferStatsSectionTitle: {
    color: '#88F8BB',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 8,
    textAlign: 'center'
  },
  golferStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  golferStatName: {
    color: 'rgba(245,251,239,0.7)',
    fontSize: 11,
    width: 65
  },
  golferStatBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    marginHorizontal: 6,
    overflow: 'hidden'
  },
  golferStatBarFill: {
    height: '100%',
    borderRadius: 4
  },
  golferStatValue: {
    color: '#f5fbef',
    fontSize: 11,
    fontWeight: '700',
    width: 24,
    textAlign: 'right'
  },
  golferNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12
  },
  golferBackBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20
  },
  golferBackBtnText: {
    color: 'rgba(245,251,239,0.6)',
    fontSize: 14,
    fontWeight: '700'
  },
  golferSelectBtn: {
    backgroundColor: '#4a9e3f',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24
  },
  golferSelectBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900'
  },
  // Club select styles
  clubSelectCount: {
    color: '#f5fbef',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10
  },
  clubCategoryTabs: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 4
  },
  clubCategoryTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center'
  },
  clubCategoryTabActive: {
    backgroundColor: 'rgba(74,158,63,0.3)',
    borderWidth: 1,
    borderColor: '#4a9e3f'
  },
  clubCategoryTabText: {
    color: 'rgba(245,251,239,0.5)',
    fontSize: 11,
    fontWeight: '700'
  },
  clubCategoryTabTextActive: {
    color: '#88F8BB'
  },
  clubListScroll: {
    flex: 1,
    marginBottom: 8
  },
  clubItemCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    position: 'relative'
  },
  clubItemCardSelected: {
    borderColor: '#4a9e3f',
    backgroundColor: 'rgba(74,158,63,0.1)'
  },
  clubItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  clubItemName: {
    color: '#f5fbef',
    fontSize: 13,
    fontWeight: '800',
    flex: 1
  },
  clubItemBrand: {
    color: 'rgba(245,251,239,0.4)',
    fontSize: 10,
    marginRight: 8
  },
  clubItemCarry: {
    color: '#88F8BB',
    fontSize: 12,
    fontWeight: '700'
  },
  clubItemStats: {
    marginTop: 4
  },
  clubStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4
  },
  clubStatName: {
    color: 'rgba(245,251,239,0.6)',
    fontSize: 11,
    width: 42
  },
  clubStatBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    marginHorizontal: 6,
    overflow: 'hidden'
  },
  clubStatBarFill: {
    height: '100%',
    borderRadius: 4
  },
  clubStatValue: {
    color: '#f5fbef',
    fontSize: 11,
    fontWeight: '700',
    width: 24,
    textAlign: 'right'
  },
  clubItemCheck: {
    position: 'absolute',
    right: 8,
    top: 8,
    fontSize: 14
  },
  clubItemAdd: {
    position: 'absolute',
    right: 10,
    top: 6,
    color: 'rgba(245,251,239,0.3)',
    fontSize: 18,
    fontWeight: '700'
  },
  puttCompactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(8,12,10,0.85)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginHorizontal: 6,
    marginBottom: 4
  },
  puttCompactInfo: {
    flex: 1
  },
  puttCompactTarget: {
    color: '#f5fbef',
    fontSize: 14,
    fontWeight: '700'
  },
  puttCompactSub: {
    color: '#b8e0a8',
    fontSize: 11
  },
  puttCompactSimBtn: {
    backgroundColor: '#4a9e3f',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginLeft: 8
  },
  puttCompactSimText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800'
  },
  simulatePuttButton: {
    alignSelf: 'stretch',
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(102, 186, 90, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(199, 242, 161, 0.9)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  simulatePuttButtonText: {
    color: '#0f1e0f',
    fontSize: 14,
    fontWeight: '800'
  },
  puttTargetBanner: {
    borderRadius: 12,
    backgroundColor: 'rgba(8, 12, 10, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(194, 232, 149, 0.55)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 3
  },
  puttTargetBannerTitle: {
    color: '#f5ffde',
    fontSize: 16,
    fontWeight: '800'
  },
  puttTargetBannerSub: {
    color: '#d3e9c6',
    fontSize: 12,
    fontWeight: '600'
  },
  bottomMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10
  },
  clubCard: {
    flex: 1,
    minHeight: 124,
    borderRadius: 16,
    backgroundColor: 'rgba(8, 12, 10, 0.74)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.17)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'space-between'
  },
  clubCardActive: {
    borderColor: 'rgba(111, 174, 255, 0.92)',
    backgroundColor: 'rgba(14, 27, 47, 0.78)'
  },
  clubCardTitle: {
    color: '#eff8e6',
    fontSize: 15,
    fontWeight: '700'
  },
  clubCardSub: {
    color: '#aec3a9',
    fontSize: 12
  },
  clubCardYards: {
    color: '#f5fbef',
    fontSize: 26,
    fontWeight: '800'
  },
  clubCardMeta: {
    color: '#a9bda5',
    fontSize: 11
  },
  swingDock: {
    width: SHOT_PAD_SIZE + 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  swingPad: {
    width: SHOT_PAD_SIZE,
    height: SHOT_PAD_SIZE,
    borderRadius: SHOT_PAD_SIZE / 2,
    backgroundColor: 'rgba(7, 11, 9, 0.84)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  swingPadActive: {
    borderColor: '#93d27c',
    shadowColor: '#94d87d',
    shadowOpacity: 0.48,
    shadowRadius: 12
  },
  powerRing: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#4adb6a'
  },
  swingHaloOuter: {
    position: 'absolute',
    width: 102,
    height: 102,
    borderRadius: 52,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)'
  },
  swingHaloInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    borderColor: 'rgba(248,251,242,0.8)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  swingPct: {
    color: '#f6fbef',
    fontSize: 18,
    fontWeight: '800'
  },
  shotPadGuideWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center'
  },
  shotPadCrosshairH: {
    position: 'absolute',
    width: SHOT_PAD_SIZE - 46,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)'
  },
  shotPadCrosshairV: {
    position: 'absolute',
    width: 1,
    height: SHOT_PAD_SIZE - 46,
    backgroundColor: 'rgba(255,255,255,0.18)'
  },
  spinDot: {
    position: 'absolute',
    width: SPIN_DOT_RADIUS * 2,
    height: SPIN_DOT_RADIUS * 2,
    borderRadius: SPIN_DOT_RADIUS,
    backgroundColor: '#4b94ff',
    borderWidth: 2,
    borderColor: '#d8ecff',
    shadowColor: '#4b94ff',
    shadowOpacity: 0.55,
    shadowRadius: 10
  },
  spinDotActive: {
    transform: [{ scale: 1.08 }],
    shadowOpacity: 0.78,
    shadowRadius: 14
  },
  swingGuideWrap: {
    position: 'absolute',
    bottom: -28,
    width: SHOT_PAD_SIZE + 40,
    alignItems: 'center'
  },
  swingGuideText: {
    color: '#d0dfcb',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center'
  },
  shotDoneButton: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 10
  },
  shotDoneText: {
    color: '#f6fbef',
    fontSize: 13,
    fontWeight: '700'
  },
  spinDotClosed: {
    position: 'absolute',
    width: SPIN_DOT_RADIUS * 2,
    height: SPIN_DOT_RADIUS * 2,
    borderRadius: SPIN_DOT_RADIUS,
    backgroundColor: '#4b94ff',
    borderWidth: 2,
    borderColor: '#d8ecff'
  },
  clubSelectorWrap: {
    borderRadius: 14,
    backgroundColor: 'rgba(7, 11, 9, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 8,
    gap: 8
  },
  clubPickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8
  },
  clubPickerTriggerLabel: {
    color: '#9fb59f',
    fontSize: 11,
    fontWeight: '700'
  },
  clubPickerTriggerValue: {
    flex: 1,
    color: '#f5fbef',
    fontSize: 13,
    fontWeight: '700'
  },
  clubPickerTriggerChevron: {
    color: '#d6e7d0',
    fontSize: 11,
    fontWeight: '700'
  },
  clubScrollContent: {
    paddingHorizontal: 8,
    gap: 7
  },
  clubChip: {
    minWidth: 38,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center'
  },
  clubChipActive: {
    backgroundColor: '#2c6842',
    borderColor: '#95d28a'
  },
  clubChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#d6e7d0'
  },
  clubChipTextActive: {
    color: '#f6fbf4'
  },
  helperText: {
    fontSize: 12,
    color: '#d0dfcb',
    textAlign: 'center'
  },
  lastShotText: {
    fontSize: 12,
    color: '#aeca9f',
    textAlign: 'center'
  },
  warning: {
    fontSize: 12,
    color: '#e1917f',
    textAlign: 'center',
    fontWeight: '700'
  },
  success: {
    fontSize: 12,
    color: '#9ed98f',
    textAlign: 'center',
    fontWeight: '700'
  },
  sunkRow: {
    alignItems: 'center',
    gap: 6
  },
  nextHoleBtn: {
    backgroundColor: '#4a9e3f',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8
  },
  chooseCourseBtn: {
    backgroundColor: '#327a96',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8
  },
  nextHoleBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700'
  },
  spaceMenuScreen: {
    flex: 1,
    backgroundColor: '#05070A',
    position: 'relative',
    overflow: 'hidden'
  },
  menuStarsLayer: {
    ...StyleSheet.absoluteFillObject
  },
  menuStar: {
    position: 'absolute',
    borderRadius: 999
  },
  menuGreenGlow: {
    position: 'absolute',
    left: -100,
    right: -100,
    bottom: -200,
    height: 500,
    borderRadius: 500,
    backgroundColor: '#13251D',
    backgroundImage: 'radial-gradient(circle at 50% 100%, #1B3D2F 0%, #13251D 45%, rgba(5,7,10,0) 78%)',
    opacity: 0.92
  },
  menuContentWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 26,
    paddingBottom: 20
  },
  menuDataBar: {
    color: '#A0A0A0',
    fontSize: 10,
    letterSpacing: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' })
  },
  menuTitleBlock: {
    alignItems: 'center',
    gap: 12,
    marginTop: 20
  },
  menuTitleTop: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 12,
    textTransform: 'uppercase',
    textAlign: 'center'
  },
  menuTitleBottomRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 14
  },
  menuTitleBottomMain: {
    color: '#FFFFFF',
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: 6,
    textTransform: 'uppercase'
  },
  menuTitleTour: {
    color: '#88F8BB',
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: 6,
    textTransform: 'uppercase'
  },
  heroWrap: {
    width: 150,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 10
  },
  heroRing: {
    position: 'absolute',
    width: 120,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(136,248,187,0.5)',
    backgroundColor: 'rgba(136,248,187,0.08)',
    transform: [{ rotate: '-12deg' }]
  },
  heroBall: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#d8dde5'
  },
  heroDimple: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ced4dc'
  },
  heroFlagPole: {
    position: 'absolute',
    top: 12,
    left: 74,
    width: 2,
    height: 18,
    backgroundColor: '#88F8BB'
  },
  heroFlag: {
    position: 'absolute',
    top: 10,
    left: 76,
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 0,
    borderRightWidth: 10,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: '#88F8BB'
  },
  menuButtonStack: {
    width: '100%',
    alignItems: 'center',
    gap: 12
  },
  menuButtonWrap: {
    width: '100%',
    alignItems: 'center'
  },
  spaceMenuBtn: {
    width: '90%',
    maxWidth: 340,
    height: 56,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18
  },
  spaceMenuBtnDisabled: {
    opacity: 0.5,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  spaceMenuBtnActive: {
    width: '90%',
    maxWidth: 340,
    height: 56,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: '#88F8BB',
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    position: 'relative'
  },
  spaceMenuBtnLeft: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 4
  },
  spaceMenuBtnLeftMuted: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 4
  },
  spaceMenuBtnRight: {
    color: '#88F8BB',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1
  },
  spaceMenuBtnRightMuted: {
    color: 'rgba(136,248,187,0.3)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1
  },
  lCorner: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderColor: '#88F8BB'
  },
  lCornerTopLeft: {
    top: -1,
    left: -1,
    borderTopWidth: 2,
    borderLeftWidth: 2
  },
  lCornerTopRight: {
    top: -1,
    right: -1,
    borderTopWidth: 2,
    borderRightWidth: 2
  },
  lCornerBottomLeft: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 2,
    borderLeftWidth: 2
  },
  lCornerBottomRight: {
    bottom: -1,
    right: -1,
    borderBottomWidth: 2,
    borderRightWidth: 2
  },
  menuSoonBadge: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.35)',
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase'
  },
  menuBottomBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8
  },
  menuBottomLeft: {
    color: '#A0A0A0',
    fontSize: 10,
    letterSpacing: 1
  },
  menuBottomDot: {
    color: '#88F8BB'
  },
  menuBottomRight: {
    color: '#A0A0A0',
    fontSize: 10,
    letterSpacing: 1
  },
  coursesContentWrap: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 26,
    paddingBottom: 20
  },
  coursesTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 8,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 14
  },
  courseMenuList: {
    flex: 1
  },
  coursesListContent: {
    gap: 12,
    paddingBottom: 16
  },
  spaceCourseCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    padding: 14,
    gap: 6
  },
  spaceCourseCardActive: {
    borderColor: '#88F8BB'
  },
  spaceCourseCardPressed: {
    opacity: 0.85
  },
  spaceCourseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  spaceCourseTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1
  },
  spaceCourseDifficulty: {
    color: '#88F8BB',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1
  },
  spaceCourseDesigner: {
    color: '#A0A0A0',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1
  },
  spaceCourseDescription: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500'
  },
  coursesPlayButton: {
    marginTop: 12,
    height: 52,
    borderRadius: 6,
    backgroundColor: '#88F8BB',
    alignItems: 'center',
    justifyContent: 'center'
  },
  coursesPlayButtonText: {
    color: '#05070A',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 4
  },
  coursesBackButton: {
    marginTop: 10,
    height: 44,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  coursesBackButtonText: {
    color: '#A0A0A0',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 3
  },
  scorecardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 260,
    paddingHorizontal: 12
  },
  scorecardCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    backgroundColor: '#14351f',
    borderWidth: 1,
    borderColor: 'rgba(190, 231, 188, 0.28)',
    padding: 14,
    gap: 8
  },
  scorecardTitle: {
    color: '#f4fcef',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4
  },
  scorecardHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.18)',
    paddingBottom: 6
  },
  scorecardHeaderCell: {
    color: '#c8dfc4',
    fontSize: 12,
    fontWeight: '800'
  },
  scorecardScrollH: {
    maxHeight: 160
  },
  scorecardTable: {
    flexDirection: 'column',
    gap: 3
  },
  scorecardTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1
  },
  scorecardLabelCell: {
    width: 44,
    height: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 2
  },
  scorecardLabelText: {
    color: '#c8dfc4',
    fontSize: 11,
    fontWeight: '800'
  },
  scorecardDataCell: {
    width: 34,
    height: 32,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  scorecardDataCellActive: {
    backgroundColor: 'rgba(88, 154, 96, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(152, 214, 159, 0.8)'
  },
  scorecardDataText: {
    color: '#f2f9ed',
    fontSize: 12,
    fontWeight: '700'
  },
  scorecardTotalCell: {
    width: 38,
    height: 32,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  scorecardTotalCellText: {
    color: '#f4fcef',
    fontSize: 12,
    fontWeight: '800'
  },
  scorecardUnplayed: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 12
  },
  scoreBadgeText: {
    color: '#f2f9ed',
    fontSize: 12,
    fontWeight: '800'
  },
  scoreBadgeSingleCircle: {
    minWidth: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7
  },
  scoreBadgeDoubleOuter: {
    minWidth: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2
  },
  scoreBadgeDoubleInner: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6
  },
  scoreBadgeSingleSquare: {
    minWidth: 26,
    height: 26,
    borderWidth: 2,
    borderColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7
  },
  scoreBadgeDoubleSquareOuter: {
    minWidth: 30,
    height: 30,
    borderWidth: 2,
    borderColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2
  },
  scoreBadgeDoubleSquareInner: {
    minWidth: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6
  },
  scoreBadgeSolidSquare: {
    minWidth: 26,
    height: 26,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7
  },
  scoreBadgeSolidText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800'
  },
  scorecardTotals: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
    paddingTop: 8,
    gap: 5
  },
  scorecardTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  scorecardTotalLabel: {
    color: '#d4e9d2',
    fontSize: 12,
    fontWeight: '700'
  },
  scorecardTotalValue: {
    color: '#f4fcef',
    fontSize: 14,
    fontWeight: '800'
  },
  scoreDiffUnder: {
    color: '#22c55e'
  },
  scoreDiffOver: {
    color: '#ef4444'
  },
  scoreDiffEven: {
    color: '#ffffff'
  },
  overSwingText: {
    color: '#e07f6d'
  },
  disabled: {
    opacity: 0.45
  },
  summary: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(232, 243, 225, 0.92)'
  },
  summaryTitle: {
    fontWeight: '800',
    color: '#1d321f'
  },
  summaryText: {
    color: '#2f4730'
  },
  liePip: {
    position: 'absolute',
    top: 130,
    left: 10,
    backgroundColor: 'rgba(20, 35, 20, 0.88)',
    borderRadius: 12,
    padding: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    zIndex: 100
  },
  lieColorBar: {
    width: 4,
    height: 28,
    borderRadius: 2
  },
  lieEmoji: {
    fontSize: 18
  },
  lieLabel: {
    color: '#d4e8ce',
    fontSize: 12,
    fontWeight: '700'
  },
  liePenalty: {
    color: '#ff9944',
    fontSize: 10,
    fontWeight: '600'
  },
  shotStatsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200
  },
  shotStatsCard: {
    backgroundColor: 'rgba(20, 38, 22, 0.96)',
    borderRadius: 16,
    padding: 20,
    width: 280,
    borderWidth: 1,
    borderColor: 'rgba(100, 180, 100, 0.3)'
  },
  shotStatsTitle: {
    color: '#e8f3e0',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center'
  },
  swingPathBox: {
    marginBottom: 12,
    alignItems: 'center'
  },
  swingPathLabel: {
    color: '#8aab82',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4
  },
  swingPathCanvas: {
    width: 120,
    height: 150,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
    overflow: 'hidden'
  },
  swingPathCenterLine: {
    position: 'absolute',
    left: 59,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 1
  },
  swingPathDot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4
  },
  swingPathLegend: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4
  },
  swingPathLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  swingPathLegendDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  swingPathLegendText: {
    color: '#8aab82',
    fontSize: 9,
    fontWeight: '600'
  },
  shotStatsGrid: {
    gap: 6
  },
  shotStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)'
  },
  shotStatLabel: {
    color: '#8aab82',
    fontSize: 13,
    fontWeight: '600'
  },
  shotStatValue: {
    color: '#e0f0d8',
    fontSize: 13,
    fontWeight: '700'
  },
  shotStatTotal: {
    color: '#ffdd44',
    fontWeight: '800'
  },
  shotStatsDismiss: {
    color: 'rgba(200,220,200,0.5)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12
  }
});
