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
    name: 'Warm Up Lane',
    par: 2,
    ballStart: { x: 50, y: 148 },
    cup: { x: 50, y: 15 },
    obstacles: [],
    hazards: [
      { type: 'sandRect', x: 33, y: 72, w: 34, h: 16 }
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
    hazards: [
      { type: 'sandRect', x: 62, y: 52, w: 30, h: 18 }
    ]
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

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

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

export default function App() {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const courseWidth = clamp(screenWidth - 24, 280, 430);
  const courseHeight = Math.min(screenHeight * 0.68, courseWidth * 1.6);

  const [holeIndex, setHoleIndex] = useState(0);
  const [strokesCurrent, setStrokesCurrent] = useState(0);
  const [scores, setScores] = useState(Array(HOLES.length).fill(null));
  const [ball, setBall] = useState(HOLES[0].ballStart);
  const [aimPoint, setAimPoint] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sunk, setSunk] = useState(false);
  const [waterNotice, setWaterNotice] = useState(false);

  const ballRef = useRef(ball);
  const velocityRef = useRef({ x: 0, y: 0 });
  const lastTsRef = useRef(null);
  const frameRef = useRef(null);

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
    setAimPoint(null);
    setIsDragging(false);
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
    setAimPoint(null);
    setIsDragging(false);
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
    setAimPoint(null);
    setIsDragging(false);
  }, [holeIndex, currentHole.ballStart]);

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

  const onDragStart = (locationX, locationY) => {
    if (sunk) {
      return false;
    }
    if (magnitude(velocityRef.current) > 0.35) {
      return false;
    }
    const touchWorld = toWorld({ x: locationX, y: locationY });
    const dx = touchWorld.x - ballRef.current.x;
    const dy = touchWorld.y - ballRef.current.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 8) {
      return false;
    }
    setIsDragging(true);
    setAimPoint(touchWorld);
    setWaterNotice(false);
    return true;
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) =>
          onDragStart(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
        onMoveShouldSetPanResponder: () => false,
        onPanResponderMove: (evt) => {
          if (!isDragging) {
            return;
          }
          const touchWorld = toWorld({
            x: evt.nativeEvent.locationX,
            y: evt.nativeEvent.locationY
          });
          setAimPoint(touchWorld);
        },
        onPanResponderRelease: () => {
          if (!isDragging || !aimPoint) {
            setIsDragging(false);
            setAimPoint(null);
            return;
          }
          const drag = {
            x: aimPoint.x - ballRef.current.x,
            y: aimPoint.y - ballRef.current.y
          };
          const pull = magnitude(drag);
          if (pull > 1.5) {
            const dir = normalize({ x: -drag.x, y: -drag.y });
            const power = clamp(pull / 20, 0, 1);
            const speed = 120 + power * 230;
            velocityRef.current = {
              x: dir.x * speed,
              y: dir.y * speed
            };
            setStrokesCurrent((s) => s + 1);
          }
          setIsDragging(false);
          setAimPoint(null);
        },
        onPanResponderTerminate: () => {
          setIsDragging(false);
          setAimPoint(null);
        }
      }),
    [aimPoint, isDragging, sunk]
  );

  const screenBall = toScreen(ball);
  const screenCup = toScreen(currentHole.cup);

  let guide = null;
  let powerPct = 0;

  if (isDragging && aimPoint) {
    const pull = {
      x: aimPoint.x - ball.x,
      y: aimPoint.y - ball.y
    };
    const shoot = {
      x: -pull.x,
      y: -pull.y
    };
    const shootScreen = { x: shoot.x * scaleX, y: shoot.y * scaleY };
    const len = Math.hypot(shootScreen.x, shootScreen.y);
    const clampedLen = clamp(len, 0, 95);
    powerPct = Math.round((clamp(magnitude(pull) / 20, 0, 1)) * 100);
    const angle = (Math.atan2(shootScreen.y, shootScreen.x) * 180) / Math.PI;
    guide = (
      <View
        style={[
          styles.aimLine,
          {
            width: clampedLen,
            left: screenBall.x,
            top: screenBall.y,
            transform: [{ rotate: `${angle}deg` }]
          }
        ]}
      />
    );
  }

  const finishedAll = scores.every((s) => typeof s === 'number');
  const isLastHole = holeIndex === HOLES.length - 1;

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

      <View style={[styles.course, { width: courseWidth, height: courseHeight }]} {...panResponder.panHandlers}>
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
                  styles.bumper,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    left: (o.x - o.r) * scaleX,
                    top: (o.y - o.r) * scaleY
                  }
                ]}
              />
            );
          }

          return null;
        })}

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

        {guide}

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
        {isDragging ? (
          <Text style={styles.tip}>Release to shoot • Power {powerPct}%</Text>
        ) : (
          <Text style={styles.tip}>Touch near the ball, drag to aim, release to shoot.</Text>
        )}

        {waterNotice && !sunk ? <Text style={styles.warning}>Water hazard: +1 stroke, ball reset.</Text> : null}

        {sunk ? (
          <Text style={styles.success}>Hole complete in {strokesCurrent} strokes.</Text>
        ) : null}

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
    backgroundColor: '#eef3e8',
    alignItems: 'center'
  },
  header: {
    width: '100%',
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 8
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
    backgroundColor: '#86be68',
    borderWidth: 3,
    borderColor: '#42683f',
    overflow: 'hidden',
    position: 'relative'
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
    paddingTop: 10,
    paddingBottom: 16,
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
