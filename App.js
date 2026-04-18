import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  PanResponder,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

const HOLES = [
  {
    id: 1,
    name: 'Pine Meadow',
    par: 4,
    ballStart: { x: 50, y: 148 },
    cup: { x: 78, y: 18 },
    terrain: {
      tee: { x: 43, y: 144, w: 14, h: 10, r: 4 },
      fairway: [
        { x: 39, y: 102, w: 22, h: 50, r: 12 },
        { x: 43, y: 62, w: 30, h: 52, r: 14 },
        { x: 58, y: 28, w: 24, h: 42, r: 12 }
      ],
      green: { x: 67, y: 7, w: 24, h: 26, r: 13 }
    },
    obstacles: [
      { type: 'circle', x: 27, y: 108, r: 5, look: 'tree' },
      { type: 'circle', x: 72, y: 95, r: 5, look: 'tree' },
      { type: 'circle', x: 30, y: 65, r: 6, look: 'tree' }
    ],
    hazards: [
      { type: 'sandRect', x: 61, y: 17, w: 10, h: 8 },
      { type: 'sandRect', x: 84, y: 20, w: 10, h: 8 }
    ]
  },
  {
    id: 2,
    name: 'Split Gate',
    par: 3,
    ballStart: { x: 50, y: 150 },
    cup: { x: 82, y: 18 },
    obstacles: [
      { type: 'rect', x: 20, y: 92, w: 60, h: 8 },
      { type: 'rect', x: 0, y: 56, w: 58, h: 8 }
    ],
    hazards: [{ type: 'sandRect', x: 62, y: 52, w: 30, h: 18 }]
  },
  {
    id: 3,
    name: 'Dogleg Drift',
    par: 4,
    ballStart: { x: 16, y: 148 },
    cup: { x: 84, y: 22 },
    obstacles: [
      { type: 'rect', x: 24, y: 110, w: 60, h: 8 },
      { type: 'rect', x: 16, y: 64, w: 58, h: 8 },
      { type: 'circle', x: 72, y: 92, r: 8 }
    ],
    hazards: [
      { type: 'waterRect', x: 0, y: 86, w: 24, h: 18 },
      { type: 'sandRect', x: 58, y: 48, w: 34, h: 16 }
    ]
  },
  {
    id: 4,
    name: 'Bumper Tunnel',
    par: 4,
    ballStart: { x: 12, y: 150 },
    cup: { x: 88, y: 14 },
    obstacles: [
      { type: 'rect', x: 0, y: 106, w: 72, h: 8 },
      { type: 'rect', x: 28, y: 70, w: 72, h: 8 },
      { type: 'circle', x: 38, y: 46, r: 8 },
      { type: 'circle', x: 60, y: 32, r: 7 }
    ],
    hazards: [
      { type: 'sandRect', x: 10, y: 26, w: 24, h: 14 },
      { type: 'waterRect', x: 72, y: 96, w: 28, h: 20 }
    ]
  },
  {
    id: 5,
    name: 'Mini Maze',
    par: 5,
    ballStart: { x: 8, y: 148 },
    cup: { x: 92, y: 10 },
    obstacles: [
      { type: 'rect', x: 16, y: 126, w: 64, h: 8 },
      { type: 'rect', x: 0, y: 96, w: 60, h: 8 },
      { type: 'rect', x: 40, y: 66, w: 60, h: 8 },
      { type: 'rect', x: 0, y: 36, w: 64, h: 8 },
      { type: 'circle', x: 76, y: 54, r: 7 },
      { type: 'circle', x: 26, y: 18, r: 7 }
    ],
    hazards: [
      { type: 'waterRect', x: 64, y: 112, w: 36, h: 16 },
      { type: 'waterRect', x: 0, y: 48, w: 26, h: 14 },
      { type: 'sandRect', x: 70, y: 22, w: 20, h: 14 }
    ]
  }
];

const WORLD = { w: 100, h: 160 };
const SWING_PAD_SIZE = 148;
const PAD_CENTER = SWING_PAD_SIZE / 2;
const SWING_START_RADIUS = 34;
const MIN_PULL_TO_ARM = 12;
const MAX_PULL_DISTANCE = 92;

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

export default function App() {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const courseWidth = clamp(screenWidth - 24, 280, 430);
  const courseHeight = Math.min(screenHeight * 0.62, courseWidth * 1.6);

  const [holeIndex, setHoleIndex] = useState(0);
  const [strokesCurrent, setStrokesCurrent] = useState(0);
  const [scores, setScores] = useState(Array(HOLES.length).fill(null));
  const [ball, setBall] = useState(HOLES[0].ballStart);
  const [aimAngle, setAimAngle] = useState(getAimAngleToCup(HOLES[0].ballStart, HOLES[0].cup));
  const [isAiming, setIsAiming] = useState(false);
  const [sunk, setSunk] = useState(false);
  const [waterNotice, setWaterNotice] = useState(false);
  const [swingActive, setSwingActive] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [powerPct, setPowerPct] = useState(0);
  const [lastShotNote, setLastShotNote] = useState('Pull down, then flick up through center.');

  const ballRef = useRef(ball);
  const velocityRef = useRef({ x: 0, y: 0 });
  const lastTsRef = useRef(null);
  const frameRef = useRef(null);
  const swingTrackRef = useRef({
    active: false,
    armed: false,
    maxPullDown: 0,
    maxPullLateral: 0,
    deepest: { x: 0, y: 0 },
    crossedCenter: false,
    maxUpLateral: 0
  });

  const currentHole = HOLES[holeIndex];
  const scaleX = courseWidth / WORLD.w;
  const scaleY = courseHeight / WORLD.h;
  const ballRadius = 2.3 * scaleX;
  const cupRadius = 3.0 * scaleX;

  const toScreen = (p) => ({ x: p.x * scaleX, y: p.y * scaleY });
  const toWorld = (p) => ({ x: p.x / scaleX, y: p.y / scaleY });

  const resetBall = ({ penaltyStroke = false } = {}) => {
    velocityRef.current = { x: 0, y: 0 };
    setBall(currentHole.ballStart);
    setAimAngle(getAimAngleToCup(currentHole.ballStart, currentHole.cup));
    setIsAiming(false);
    setSwingActive(false);
    setPullDistance(0);
    setPowerPct(0);
    if (penaltyStroke) {
      setStrokesCurrent((s) => s + 1);
      setWaterNotice(true);
    }
  };

  const retryHole = () => {
    setSunk(false);
    setWaterNotice(false);
    setStrokesCurrent(0);
    setScores((prev) => {
      const next = [...prev];
      next[holeIndex] = null;
      return next;
    });
    velocityRef.current = { x: 0, y: 0 };
    setBall(currentHole.ballStart);
    setAimAngle(getAimAngleToCup(currentHole.ballStart, currentHole.cup));
    setIsAiming(false);
    setSwingActive(false);
    setPullDistance(0);
    setPowerPct(0);
    setLastShotNote('Pull down, then flick up through center.');
  };

  useEffect(() => {
    ballRef.current = ball;
  }, [ball]);

  useEffect(() => {
    setSunk(false);
    setWaterNotice(false);
    setStrokesCurrent(0);
    velocityRef.current = { x: 0, y: 0 };
    setBall(currentHole.ballStart);
    setAimAngle(getAimAngleToCup(currentHole.ballStart, currentHole.cup));
    setIsAiming(false);
    setSwingActive(false);
    setPullDistance(0);
    setPowerPct(0);
    setLastShotNote('Pull down, then flick up through center.');
  }, [holeIndex, currentHole.ballStart, currentHole.cup]);

  useEffect(() => {
    const tick = (ts) => {
      if (lastTsRef.current == null) {
        lastTsRef.current = ts;
      }
      const dt = Math.min((ts - lastTsRef.current) / 1000, 0.033);
      lastTsRef.current = ts;

      if (!sunk) {
        const vel = velocityRef.current;
        const speed = magnitude(vel);

        if (speed > 0.3) {
          let next = {
            x: ballRef.current.x + vel.x * dt,
            y: ballRef.current.y + vel.y * dt
          };

          const onSand = currentHole.hazards.some((h) => {
            if (h.type === 'sandRect') {
              return pointInRect(next, h);
            }
            return false;
          });

          const friction = onSand ? 4.4 : 2.1;
          const dragFactor = Math.max(0, 1 - friction * dt);
          vel.x *= dragFactor;
          vel.y *= dragFactor;

          const radiusWorld = ballRadius / scaleX;
          const restitution = 0.72;

          if (next.x < radiusWorld) {
            next.x = radiusWorld;
            vel.x = Math.abs(vel.x) * restitution;
          }
          if (next.x > WORLD.w - radiusWorld) {
            next.x = WORLD.w - radiusWorld;
            vel.x = -Math.abs(vel.x) * restitution;
          }
          if (next.y < radiusWorld) {
            next.y = radiusWorld;
            vel.y = Math.abs(vel.y) * restitution;
          }
          if (next.y > WORLD.h - radiusWorld) {
            next.y = WORLD.h - radiusWorld;
            vel.y = -Math.abs(vel.y) * restitution;
          }

          currentHole.obstacles.forEach((o) => {
            if (o.type === 'rect') {
              const nearestX = clamp(next.x, o.x, o.x + o.w);
              const nearestY = clamp(next.y, o.y, o.y + o.h);
              const dx = next.x - nearestX;
              const dy = next.y - nearestY;
              const overlap = radiusWorld * radiusWorld - (dx * dx + dy * dy);
              if (overlap > 0) {
                let normal = normalize({ x: dx, y: dy });
                if (Math.abs(normal.x) < 0.01 && Math.abs(normal.y) < 0.01) {
                  const center = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
                  normal = normalize({ x: next.x - center.x, y: next.y - center.y });
                  if (Math.abs(normal.x) < 0.01 && Math.abs(normal.y) < 0.01) {
                    normal = { x: 0, y: -1 };
                  }
                }
                next = {
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
              const dx = next.x - o.x;
              const dy = next.y - o.y;
              const dist = Math.hypot(dx, dy);
              const minDist = o.r + radiusWorld;
              if (dist < minDist) {
                const normal = dist < 0.001 ? { x: 1, y: 0 } : { x: dx / dist, y: dy / dist };
                next = {
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

          const fellInWater = currentHole.hazards.some((h) => h.type === 'waterRect' && pointInRect(next, h));
          if (fellInWater) {
            resetBall({ penaltyStroke: true });
          } else {
            ballRef.current = next;
            setBall(next);
          }

          if (magnitude(vel) < 6) {
            vel.x = 0;
            vel.y = 0;
          }
        }
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
  }, [ballRadius, currentHole.hazards, currentHole.obstacles, scaleX, sunk]);

  useEffect(() => {
    if (sunk) {
      return;
    }
    const vel = velocityRef.current;
    const ballStopped = magnitude(vel) < 0.25;
    if (!ballStopped) {
      return;
    }
    const dx = ball.x - currentHole.cup.x;
    const dy = ball.y - currentHole.cup.y;
    const dist = Math.hypot(dx, dy);
    if (dist < cupRadius / scaleX) {
      setSunk(true);
      velocityRef.current = { x: 0, y: 0 };
      setScores((prev) => {
        const next = [...prev];
        next[holeIndex] = strokesCurrent;
        return next;
      });
    }
  }, [ball, cupRadius, currentHole.cup.x, currentHole.cup.y, holeIndex, scaleX, strokesCurrent, sunk]);

  const totalScore = scores.reduce((sum, s) => (typeof s === 'number' ? sum + s : sum), 0);
  const completed = scores.filter((s) => s != null).length;
  const ballMoving = magnitude(velocityRef.current) > 0.35;

  const setAimFromTouch = (locationX, locationY) => {
    const target = toWorld({ x: locationX, y: locationY });
    const dir = { x: target.x - ballRef.current.x, y: target.y - ballRef.current.y };
    if (magnitude(dir) < 1.25) {
      return;
    }
    setAimAngle(Math.atan2(dir.y, dir.x));
  };

  const aimResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => {
          if (sunk || swingActive || ballMoving) {
            return false;
          }
          const touch = toWorld({
            x: evt.nativeEvent.locationX,
            y: evt.nativeEvent.locationY
          });
          const distFromBall = Math.hypot(touch.x - ballRef.current.x, touch.y - ballRef.current.y);
          if (distFromBall > 20) {
            return false;
          }
          setIsAiming(true);
          setAimFromTouch(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
          return true;
        },
        onMoveShouldSetPanResponder: () => false,
        onPanResponderMove: (evt) => {
          setAimFromTouch(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        },
        onPanResponderRelease: () => {
          setIsAiming(false);
        },
        onPanResponderTerminate: () => {
          setIsAiming(false);
        }
      }),
    [ballMoving, sunk, swingActive]
  );

  const fireSwingShot = ({ releaseDx, releaseDy }) => {
    const track = swingTrackRef.current;
    const pull = clamp(track.maxPullDown, 0, MAX_PULL_DISTANCE);
    const shotPower = Math.round((pull / MAX_PULL_DISTANCE) * 125);
    const overswingPct = Math.max(0, shotPower - 100);
    const overswingRatio = overswingPct / 25;

    const upTravel = Math.max(1, track.deepest.y - releaseDy);
    const xTravel = releaseDx - track.deepest.x;
    const slope = Math.abs(xTravel) / upTravel;
    const lateral = Math.max(track.maxPullLateral, track.maxUpLateral, Math.abs(releaseDx));
    const crookedNorm = clamp(slope * 1.35 + lateral / 24, 0, 1.4);

    const rawSign = Math.sign(releaseDx || xTravel || track.deepest.x || 1);
    const errorDeg = crookedNorm * (4.5 + overswingRatio * 16);
    const finalAngle = aimAngle + degToRad(errorDeg * rawSign);

    const direction = { x: Math.cos(finalAngle), y: Math.sin(finalAngle) };
    const speed = 95 + (shotPower / 125) * 290;
    velocityRef.current = {
      x: direction.x * speed,
      y: direction.y * speed
    };
    setStrokesCurrent((s) => s + 1);

    if (errorDeg > 9) {
      setLastShotNote(`Crooked flick added ${errorDeg.toFixed(1)}° miss.`);
    } else if (overswingPct > 0) {
      setLastShotNote(`Overswing ${shotPower}%: keep flick straighter for accuracy.`);
    } else {
      setLastShotNote(`Strike ${shotPower}% power.`);
    }
  };

  const swingResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => {
          if (sunk || ballMoving) {
            return false;
          }
          const dx = evt.nativeEvent.locationX - PAD_CENTER;
          const dy = evt.nativeEvent.locationY - PAD_CENTER;
          const dist = Math.hypot(dx, dy);
          if (dist > SWING_START_RADIUS) {
            return false;
          }

          swingTrackRef.current = {
            active: true,
            armed: false,
            maxPullDown: 0,
            maxPullLateral: 0,
            deepest: { x: 0, y: 0 },
            crossedCenter: false,
            maxUpLateral: 0
          };
          setSwingActive(true);
          setPullDistance(0);
          setPowerPct(0);
          setWaterNotice(false);
          return true;
        },
        onMoveShouldSetPanResponder: () => false,
        onPanResponderMove: (evt) => {
          const track = swingTrackRef.current;
          if (!track.active) {
            return;
          }

          const dx = evt.nativeEvent.locationX - PAD_CENTER;
          const dy = evt.nativeEvent.locationY - PAD_CENTER;

          if (dy > track.maxPullDown) {
            track.maxPullDown = dy;
            track.deepest = { x: dx, y: dy };
          }

          track.maxPullLateral = Math.max(track.maxPullLateral, Math.abs(dx));

          if (track.maxPullDown >= MIN_PULL_TO_ARM) {
            track.armed = true;
          }

          if (track.armed && dy < track.maxPullDown - 2) {
            track.maxUpLateral = Math.max(track.maxUpLateral, Math.abs(dx));
          }

          if (track.armed && dy < -6) {
            track.crossedCenter = true;
          }

          const clampedPull = clamp(track.maxPullDown, 0, MAX_PULL_DISTANCE);
          setPullDistance(clampedPull);
          setPowerPct(Math.round((clampedPull / MAX_PULL_DISTANCE) * 125));
        },
        onPanResponderRelease: (evt) => {
          const track = swingTrackRef.current;
          const releaseDx = evt.nativeEvent.locationX - PAD_CENTER;
          const releaseDy = evt.nativeEvent.locationY - PAD_CENTER;

          if (!track.armed) {
            setLastShotNote('Pull farther down to load power.');
          } else if (!track.crossedCenter) {
            setLastShotNote('Flick up through center to strike the ball.');
          } else {
            fireSwingShot({ releaseDx, releaseDy });
          }

          swingTrackRef.current = {
            active: false,
            armed: false,
            maxPullDown: 0,
            maxPullLateral: 0,
            deepest: { x: 0, y: 0 },
            crossedCenter: false,
            maxUpLateral: 0
          };
          setSwingActive(false);
          setPullDistance(0);
          setPowerPct(0);
        },
        onPanResponderTerminate: () => {
          swingTrackRef.current.active = false;
          setSwingActive(false);
          setPullDistance(0);
          setPowerPct(0);
        }
      }),
    [aimAngle, ballMoving, sunk]
  );

  const screenBall = toScreen(ball);
  const screenCup = toScreen(currentHole.cup);

  const finishedAll = scores.every((s) => typeof s === 'number');
  const isLastHole = holeIndex === HOLES.length - 1;
  const guideLength = 22;
  const guideEnd = {
    x: screenBall.x + Math.cos(aimAngle) * guideLength * scaleX,
    y: screenBall.y + Math.sin(aimAngle) * guideLength * scaleY
  };
  const guideAngle = (Math.atan2(guideEnd.y - screenBall.y, guideEnd.x - screenBall.x) * 180) / Math.PI;
  const overSwing = powerPct > 100;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>Lo-Fi Pocket Golf</Text>
        <Text style={styles.meta}>
          Hole {holeIndex + 1}/{HOLES.length} • {currentHole.name} • Par {currentHole.par}
        </Text>
        <Text style={styles.meta}>Strokes: {strokesCurrent} • Total: {totalScore}</Text>
      </View>

      <View style={[styles.course, { width: courseWidth, height: courseHeight }]} {...aimResponder.panHandlers}>
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
          />
        ))}

        {currentHole.terrain?.green ? (
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

        <View
          style={[
            styles.flagPole,
            {
              left: screenCup.x - 1,
              top: screenCup.y - 18 * scaleY,
              height: 17 * scaleY
            }
          ]}
        />
        <View
          style={[
            styles.flag,
            {
              left: screenCup.x,
              top: screenCup.y - 18 * scaleY,
              borderTopWidth: 4 * scaleY,
              borderBottomWidth: 4 * scaleY,
              borderRightWidth: 9 * scaleX
            }
          ]}
        />

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
          style={[
            styles.aimLine,
            {
              width: Math.hypot(guideEnd.x - screenBall.x, guideEnd.y - screenBall.y),
              left: screenBall.x,
              top: screenBall.y,
              transform: [{ rotate: `${guideAngle}deg` }]
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
              top: screenBall.y - ballRadius
            }
          ]}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.tip}>
          {isAiming
            ? 'Adjusting aim...'
            : 'Aim: drag near ball or use L/R buttons. Swing: pull down, flick up through center.'}
        </Text>

        <View style={styles.row}>
          <Pressable
            style={[styles.button, styles.ghost]}
            onPress={() => setAimAngle((a) => a - degToRad(4))}
            disabled={sunk || ballMoving}
          >
            <Text style={styles.buttonText}>Aim Left</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.ghost]}
            onPress={() => setAimAngle((a) => a + degToRad(4))}
            disabled={sunk || ballMoving}
          >
            <Text style={styles.buttonText}>Aim Right</Text>
          </Pressable>
        </View>

        <View style={styles.powerWrap}>
          <View style={styles.powerHeader}>
            <Text style={styles.powerLabel}>Power {powerPct}%</Text>
            <Text style={[styles.powerLabel, overSwing && styles.overSwingText]}>
              {overSwing ? 'Over-swing zone' : 'Ideal up to 100%'}
            </Text>
          </View>
          <View style={styles.powerTrack}>
            <View style={[styles.powerSafe, { width: `${(100 / 125) * 100}%` }]} />
            <View style={[styles.powerBar, { width: `${(powerPct / 125) * 100}%` }]} />
            <View style={styles.powerCut} />
          </View>
        </View>

        <View style={styles.swingArea}>
          <View style={[styles.swingPad, swingActive && styles.swingPadActive]} {...swingResponder.panHandlers}>
            <View style={styles.padRing}>
              <View style={styles.padCenter} />
            </View>
            <View
              style={[
                styles.pullMarker,
                {
                  top: PAD_CENTER + pullDistance - 7,
                  backgroundColor: overSwing ? '#bc3b2f' : '#f0ead3'
                }
              ]}
            />
          </View>
        </View>

        <Text style={styles.tip}>{lastShotNote}</Text>

        {waterNotice && !sunk ? <Text style={styles.warning}>Water hazard: +1 stroke, ball reset.</Text> : null}

        {sunk ? <Text style={styles.success}>Hole complete in {strokesCurrent} strokes.</Text> : null}

        <View style={styles.row}>
          <Pressable style={styles.button} onPress={retryHole}>
            <Text style={styles.buttonText}>Retry Hole</Text>
          </Pressable>

          <Pressable
            style={[styles.button, styles.ghost]}
            onPress={() => resetBall({ penaltyStroke: true })}
          >
            <Text style={styles.buttonText}>Quick Reset</Text>
          </Pressable>
        </View>

        <View style={styles.row}>
          <Pressable
            style={[styles.button, holeIndex === 0 && styles.disabled]}
            disabled={holeIndex === 0}
            onPress={() => setHoleIndex((h) => Math.max(0, h - 1))}
          >
            <Text style={styles.buttonText}>Prev Hole</Text>
          </Pressable>

          <Pressable
            style={[styles.button, !sunk && styles.disabled]}
            disabled={!sunk}
            onPress={() => {
              if (!isLastHole) {
                setHoleIndex((h) => h + 1);
              }
            }}
          >
            <Text style={styles.buttonText}>{isLastHole ? 'Round Done' : 'Next Hole'}</Text>
          </Pressable>
        </View>

        {finishedAll ? (
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Round Complete</Text>
            <Text style={styles.summaryText}>Played holes: {completed}</Text>
            <Text style={styles.summaryText}>Final strokes: {totalScore}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#eaf0e1',
    alignItems: 'center'
  },
  header: {
    width: '100%',
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 6
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#18261b',
    letterSpacing: 0.3
  },
  meta: {
    fontSize: 14,
    color: '#324438',
    marginTop: 2
  },
  course: {
    borderRadius: 20,
    backgroundColor: '#7da85e',
    borderWidth: 3,
    borderColor: '#3f623e',
    overflow: 'hidden',
    position: 'relative'
  },
  tee: {
    position: 'absolute',
    backgroundColor: '#4d9955',
    borderWidth: 1,
    borderColor: '#31683a'
  },
  fairway: {
    position: 'absolute',
    backgroundColor: '#9ccc78'
  },
  green: {
    position: 'absolute',
    backgroundColor: '#a9d88a',
    borderWidth: 1,
    borderColor: '#6f9c53'
  },
  wall: {
    position: 'absolute',
    backgroundColor: '#4f3f2f',
    borderRadius: 5
  },
  bumper: {
    position: 'absolute',
    backgroundColor: '#635344'
  },
  tree: {
    position: 'absolute',
    backgroundColor: '#3f723d',
    alignItems: 'center',
    justifyContent: 'center'
  },
  treeCore: {
    width: '45%',
    height: '45%',
    borderRadius: 999,
    backgroundColor: '#2e562e'
  },
  sand: {
    position: 'absolute',
    backgroundColor: '#dcc784',
    borderRadius: 16
  },
  water: {
    position: 'absolute',
    backgroundColor: '#4fa0d8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2f6b94'
  },
  flagPole: {
    position: 'absolute',
    width: 2,
    backgroundColor: '#dce6cf'
  },
  flag: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: '#f15b4f'
  },
  cup: {
    position: 'absolute',
    backgroundColor: '#16220f',
    borderWidth: 2,
    borderColor: '#0a1307'
  },
  ball: {
    position: 'absolute',
    backgroundColor: '#f7f7f4',
    borderWidth: 1,
    borderColor: '#cfd5ca'
  },
  aimLine: {
    position: 'absolute',
    height: 3,
    backgroundColor: '#f4f2d2'
  },
  footer: {
    width: '100%',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 8
  },
  tip: {
    fontSize: 13,
    color: '#25382c'
  },
  warning: {
    fontSize: 13,
    color: '#933e2d',
    fontWeight: '700'
  },
  success: {
    fontSize: 13,
    color: '#1c5d22',
    fontWeight: '700'
  },
  row: {
    flexDirection: 'row',
    gap: 10
  },
  button: {
    flex: 1,
    backgroundColor: '#2e5f34',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center'
  },
  ghost: {
    backgroundColor: '#476d4c'
  },
  buttonText: {
    color: '#f8fbf3',
    fontWeight: '700'
  },
  disabled: {
    opacity: 0.45
  },
  powerWrap: {
    gap: 4
  },
  powerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  powerLabel: {
    fontSize: 12,
    color: '#304232',
    fontWeight: '700'
  },
  overSwingText: {
    color: '#9e352b'
  },
  powerTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: '#d9e4d0',
    overflow: 'hidden',
    position: 'relative'
  },
  powerSafe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#afd58f'
  },
  powerBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#3f8f4c'
  },
  powerCut: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: `${(100 / 125) * 100}%`,
    width: 2,
    backgroundColor: '#9e352b'
  },
  swingArea: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  swingPad: {
    width: SWING_PAD_SIZE,
    height: SWING_PAD_SIZE,
    borderRadius: SWING_PAD_SIZE / 2,
    backgroundColor: '#314432',
    borderWidth: 2,
    borderColor: '#516f55',
    alignItems: 'center',
    justifyContent: 'center'
  },
  swingPadActive: {
    borderColor: '#9fd273'
  },
  padRing: {
    width: 64,
    height: 64,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#d9e4cf',
    alignItems: 'center',
    justifyContent: 'center'
  },
  padCenter: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#f4f6f2'
  },
  pullMarker: {
    position: 'absolute',
    left: PAD_CENTER - 7,
    width: 14,
    height: 14,
    borderRadius: 999
  },
  summary: {
    marginTop: 4,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#dce9d2'
  },
  summaryTitle: {
    fontWeight: '800',
    color: '#1d321f'
  },
  summaryText: {
    color: '#2f4730'
  }
});
