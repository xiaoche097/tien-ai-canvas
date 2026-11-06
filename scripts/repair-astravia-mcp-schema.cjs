// Local Astravia 0.5.86 repair. No connection settings or user data are modified.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const original = `    const objectSchema = Type.Object(properties);
    for (const key of Object.keys(properties)) {
      const property = objectSchema.properties[key];
      if (!required3.includes(key) && property)
        objectSchema.properties[key] = Type.Optional(property);
    }
    return objectSchema;`;
const repaired = `    for (const key of Object.keys(properties)) {
      const property = properties[key];
      if (!required3.includes(key) && property)
        properties[key] = Type.Optional(property);
    }
    return Type.Object(properties);`;

function projectRepair(text) {
  const start = text.indexOf('function convertMcpJsonSchemaToTypeBox(jsonSchema) {');
  const end = text.indexOf('\nasync function executeMcpToolCall(', start);
  if (start < 0 || end < start) throw Error('Unsupported Astravia bundle: converter boundaries not found');
  const converter = text.slice(start, end);
  if (converter.includes(repaired)) return { text, changed: false };
  if (converter.split(original).length !== 2) throw Error('Unsupported converter: expected exactly one known faulty block');
  return { text: text.slice(0, start) + converter.replace(original, repaired) + text.slice(end), changed: true };
}

function main() {
  const args = process.argv.slice(2);
  const bundle = args[args.indexOf('--bundle') + 1];
  if (!args.includes('--bundle') || !bundle || path.basename(bundle) !== 'agent-rpc-cli.mjs') {
    throw Error('Usage: node scripts/repair-astravia-mcp-schema.cjs --bundle <agent-rpc-cli.mjs> [--apply]');
  }
  const target = path.resolve(bundle);
  const bytes = fs.readFileSync(target);
  const before = bytes.toString('utf8');
  if (before.includes('\r')) throw Error('Unsupported line endings');
  const candidate = projectRepair(before);
  // Parse the complete candidate without executing the CLI or opening any connections.
  const vm = require('node:vm');
  new vm.SourceTextModule(candidate.text);
  const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
  const report = { changed: candidate.changed, applied: false, beforeSHA256: digest(bytes), afterSHA256: digest(candidate.text) };
  if (args.includes('--apply') && candidate.changed) {
    const backup = target + '.before-mcp-optional-' + report.beforeSHA256.slice(0, 12) + '.bak';
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, bytes, { flag: 'wx' });
    if (digest(fs.readFileSync(backup)) !== report.beforeSHA256) throw Error('Backup hash mismatch');
    if (digest(fs.readFileSync(target)) !== report.beforeSHA256) throw Error('Bundle changed while preparing repair');
    const staged = target + '.mcp-optional.next';
    fs.writeFileSync(staged, candidate.text, { flag: 'wx' });
    fs.renameSync(staged, target);
    if (digest(fs.readFileSync(target)) !== report.afterSHA256) throw Error('Installed bundle hash mismatch');
    report.applied = true;
    report.backup = backup;
  }
  console.log(JSON.stringify(report));
}

module.exports = { projectRepair };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
