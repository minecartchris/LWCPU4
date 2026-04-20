const fs = require('fs');

function readInt32LE(buf, off) { return buf.readInt32LE(off); }
function readUInt16LE(buf, off) { return buf.readUInt16LE(off); }
function readFloatLE(buf, off) { return buf.readFloatLE(off); }

function parseBlotter(path) {
  const buf = fs.readFileSync(path);

  const magic = buf.slice(0, 16).toString();
  const saveFmt = buf[16];
  const gameVer = buf.readInt32LE(17) + '.' + buf.readInt32LE(21) + '.' + buf.readInt32LE(25) + '.' + buf.readInt32LE(29);
  const saveType = buf[33];

  let off = 34;
  const numComponents = buf.readInt32LE(off); off += 4;
  const numWires = buf.readInt32LE(off); off += 4;

  const numMods = buf.readInt32LE(off); off += 4;
  const mods = [];
  for (let i = 0; i < numMods; i++) {
    const strLen = buf.readInt32LE(off); off += 4;
    const textId = buf.slice(off, off + strLen).toString(); off += strLen;
    off += 16; // version
    mods.push({ textId });
  }

  const numIDs = buf.readInt32LE(off); off += 4;
  const idMap = new Map();
  for (let i = 0; i < numIDs; i++) {
    const numericId = buf.readUInt16LE(off); off += 2;
    const strLen = buf.readInt32LE(off); off += 4;
    const textId = buf.slice(off, off + strLen).toString(); off += strLen;
    idMap.set(numericId, textId);
  }

  const components = [];
  for (let i = 0; i < numComponents; i++) {
    const compAddr = buf.readUInt32LE(off); off += 4;
    const parentAddr = buf.readUInt32LE(off); off += 4;
    const compType = buf.readUInt16LE(off); off += 2;
    const posX = buf.readInt32LE(off); off += 4;
    const posY = buf.readInt32LE(off); off += 4;
    const posZ = buf.readInt32LE(off); off += 4;
    const rotX = buf.readFloatLE(off); off += 4;
    const rotY = buf.readFloatLE(off); off += 4;
    const rotZ = buf.readFloatLE(off); off += 4;
    const rotW = buf.readFloatLE(off); off += 4;

    const numInputs = buf.readInt32LE(off); off += 4;
    const inputs = [];
    for (let j = 0; j < numInputs; j++) {
      inputs.push(buf.readInt32LE(off)); off += 4;
    }

    const numOutputs = buf.readInt32LE(off); off += 4;
    const outputs = [];
    for (let j = 0; j < numOutputs; j++) {
      outputs.push(buf.readInt32LE(off)); off += 4;
    }

    const customDataLen = buf.readInt32LE(off); off += 4;
    const customData = customDataLen > 0 ? buf.slice(off, off + customDataLen) : null;
    if (customDataLen > 0) off += customDataLen;

    components.push({
      compAddr,
      parentAddr,
      type: idMap.get(compType) || 'unknown_' + compType,
      pos: { x: posX, y: posY, z: posZ },
      inputs,
      outputs,
      customData
    });
  }

  const wires = [];
  for (let i = 0; i < numWires; i++) {
    const peg1Type = buf[off++];
    const peg1Comp = buf.readUInt32LE(off); off += 4;
    const peg1Idx = buf.readInt32LE(off); off += 4;

    const peg2Type = buf[off++];
    const peg2Comp = buf.readUInt32LE(off); off += 4;
    const peg2Idx = buf.readInt32LE(off); off += 4;

    const stateId = buf.readInt32LE(off); off += 4;
    off += 4; // rotation

    wires.push({
      from: { type: peg1Type, comp: peg1Comp, idx: peg1Idx },
      to: { type: peg2Type, comp: peg2Comp, idx: peg2Idx },
      stateId
    });
  }

  let states = [];
  if (saveType === 2) {
    const numStates = buf.readInt32LE(off); off += 4;
    for (let i = 0; i < numStates; i++) {
      states.push(buf.readInt32LE(off)); off += 4;
    }
  }

  return { components, wires, states };
}

const cpu = parseBlotter('lwSub/LWCPU4/data.partialworld');

console.log('=== Analyzing LWCPU4 Architecture ===');
console.log('Components:', cpu.components.length);
console.log('Wires:', cpu.wires.length);

// Group components by position to find functional blocks
const byPos = {};
for (const c of cpu.components) {
  const key = `${c.pos.x},${c.pos.y},${c.pos.z}`;
  if (!byPos[key]) byPos[key] = [];
  byPos[key].push(c);
}

// Find distinct x positions (likely segments)
const xPositions = [...new Set(cpu.components.map(c => c.pos.x))].sort((a, b) => a - b);
console.log('\nDistinct X positions (segments):', xPositions.slice(0, 20), '...');

// Find components at x=0 (boot ROM/reset logic)
console.log('\n=== Components at origin (boot area) ===');
const atOrigin = cpu.components.filter(c => c.pos.x === 0 && c.pos.y >= 0);
console.log('Count at x=0:', atOrigin.length);
for (const c of atOrigin.slice(0, 20)) {
  console.log(c.type, 'at', c.pos, 'in:', c.inputs.length, 'out:', c.outputs.length);
}

// Find RAM components (CheeseUtilMod.Ram8aX8b)
const rams = cpu.components.filter(c => c.type.includes('Ram'));
console.log('\n=== RAM Components ===');
console.log('RAM count:', rams.length);
for (const r of rams) {
  console.log('RAM at', r.pos, 'in:', r.inputs.length, 'out:', r.outputs.length);
  // Show custom data if present
  if (r.customData && r.customData.length > 0) {
    console.log('  Custom data:', r.customData.slice(0, 20));
  }
}

// Find TTY-related components (segment 0x40 = 25600 in fixed units)
const ttySeg = 25600;
const ttyComponents = cpu.components.filter(c => c.pos.x >= ttySeg - 500 && c.pos.x <= ttySeg + 500);
console.log('\n=== TTY Components (segment 0x40) ===');
console.log('Count:', ttyComponents.length);
const ttyTypes = {};
for (const c of ttyComponents) {
  ttyTypes[c.type] = (ttyTypes[c.type] || 0) + 1;
}
console.log('Types:', ttyTypes);

// Find all segments
console.log('\n=== Segment Analysis ===');
const segments = new Map();
for (const c of cpu.components) {
  const seg = Math.floor(c.pos.x / 600); // approximate segment
  if (!segments.has(seg)) segments.set(seg, { count: 0, types: new Set() });
  const s = segments.get(seg);
  s.count++;
  s.types.add(c.type);
}
for (const [seg, data] of segments) {
  console.log('Segment', seg, '-', data.count, 'components');
}