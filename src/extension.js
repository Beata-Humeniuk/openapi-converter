const vscode = require('vscode');
const path = require('path');
const yaml = require('js-yaml');
const { detectVersion, detectExactVersion, convertSpec, canonicalOrder, OPENAPI_VERSIONS, LATEST_VERSION } = require('./convertCore');
const { applyMarkers, liftDescriptionTags } = require('./exampleFill');

function versionTag() {
  const ext = vscode.extensions.getExtension('beatahumeniuk.openapi-converter');
  const version = ext && ext.packageJSON && ext.packageJSON.version;
  return version ? 'OpenAPI Converter ' + version + ' · ' : '';
}

function parseSpec(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return yaml.load(text);
  }
}

function serialize(obj, isYaml) {
  return isYaml
    ? yaml.dump(obj, { noRefs: true, lineWidth: -1, indent: 2 })
    : JSON.stringify(obj, null, 2) + '\n';
}

async function loadSource(uri) {
  if (uri && uri.fsPath) {
    const doc = await vscode.workspace.openTextDocument(uri);
    return { text: doc.getText(), uri };
  }
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error('Open a JSON or YAML file, or right-click a file in the Explorer.');
  }
  return { text: editor.document.getText(), uri: editor.document.uri };
}

async function pickFormat(placeHolder) {
  const format = await vscode.window.showQuickPick(
    [
      { label: 'YAML', description: 'Format: .yaml' },
      { label: 'JSON', description: 'Format: .json' }
    ],
    { placeHolder }
  );
  return format ? format.label === 'YAML' : null;
}

function resultName(source, isYaml) {
  const named = source && source.uri && source.uri.scheme === 'file';
  const base = named
    ? path.basename(source.uri.fsPath).replace(/\.(json|yaml|yml|md)$/i, '')
    : 'openapi';
  return base + '.' + (isYaml ? 'yaml' : 'json');
}

// The result opens as an untitled document. Name it after the target format so
// Ctrl+S proposes that name: for an unnamed document VS Code falls back to the
// first extension registered for the language, and a YAML extension such as
// Red Hat YAML puts .yml there.
async function showResult(content, isYaml, source) {
  const uri = vscode.Uri.from({ scheme: 'untitled', path: resultName(source, isYaml) });
  const doc = await vscode.workspace.openTextDocument(uri);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount + 1, 0), content);
  await vscode.workspace.applyEdit(edit);
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function offerSaveBeside(source, content, isYaml, message) {
  if (!source.uri || source.uri.scheme !== 'file') return;
  const src = source.uri.fsPath;
  const target = path.join(path.dirname(src), resultName(source, isYaml));
  const pick = await vscode.window.showInformationMessage(message + ' Save the result?', 'Save As');
  if (pick !== 'Save As') return;
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(target),
    filters: isYaml ? { 'YAML': ['yaml', 'yml'], 'JSON': ['json'] } : { 'JSON': ['json'], 'YAML': ['yaml', 'yml'] }
  });
  if (!uri) return;
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  vscode.window.showInformationMessage('Saved: ' + uri.fsPath);
}

async function applyMarkersCommand(uri) {
  let source;
  try {
    source = await loadSource(uri);
  } catch (e) {
    vscode.window.showErrorMessage(e.message);
    return;
  }
  let spec;
  try {
    spec = parseSpec(source.text);
  } catch (e) {
    vscode.window.showErrorMessage('Could not parse the file as JSON or YAML: ' + e.message);
    return;
  }
  if (!spec || typeof spec !== 'object' || !(spec.swagger === '2.0' || typeof spec.openapi === 'string')) {
    vscode.window.showErrorMessage('This is not a Swagger 2.0 / OpenAPI 3.x specification.');
    return;
  }
  const stats = applyMarkers(spec);
  if (!stats.examplesAdded && !stats.tagFields && !stats.mediaSet) {
    vscode.window.showInformationMessage(versionTag() + (stats.mismatched.length
      ? 'No changes — the example does not match the pattern in: ' + stats.mismatched.join(', ') + '.'
      : 'No markers to apply — file unchanged.'));
    return;
  }
  await applySpecToSource(source, spec);
  const parts = [];
  if (stats.tagFields + stats.mediaSet) parts.push('applied ' + (stats.tagFields + stats.mediaSet) + ' markers');
  if (stats.responsesAdded) parts.push('added ' + stats.responsesAdded + ' responses');
  if (stats.examplesAdded) parts.push('set ' + stats.examplesAdded + ' examples');

  if (stats.refsWrapped) {
    parts.push('wrapped ' + stats.refsWrapped + ' fields in allOf (a value next to a bare $ref would be ignored)');
  }
  const message = versionTag() + parts.join(', ') + '. Save the file (Ctrl+S) to keep the changes.';
  if (stats.mismatched.length || stats.unknownKeys.length || stats.notApplied.length) {
    const notes = [];
    if (stats.mismatched.length) notes.push(stats.mismatched.length + ' fields: example does not match the pattern.');
    if (stats.unknownKeys.length) notes.push(stats.unknownKeys.length + ' example keys not found in the model.');
    if (stats.notApplied.length) notes.push(stats.notApplied.length + ' markers not applied.');
    const pick = await vscode.window.showWarningMessage(message + ' ' + notes.join(' '), 'Show fields');
    if (pick === 'Show fields') {
      const sections = [];
      if (stats.mismatched.length) {
        sections.push('# Example does not match the pattern\n\n' +
          'One of the two is wrong. The most common cause: doubled backslashes\n' +
          'in an EA note outside quotes — `\\\\d` then means "a backslash, then\n' +
          'the letter d", not a digit.\n\n' +
          stats.mismatched.map((s) => '- ' + s).join('\n'));
      }
      if (stats.unknownKeys.length) {
        sections.push('# Example keys not found in the model\n\n' +
          'They were not inserted — usually a typo in the field name,\n' +
          'or a field the model does not know.\n\n' +
          stats.unknownKeys.map((s) => '- ' + s).join('\n'));
      }
      if (stats.notApplied.length) {
        sections.push('# Markers not applied\n\n' +
          stats.notApplied.map((s) => '- ' + s.path + ' — ' + s.reason).join('\n'));
      }
      const listDoc = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: sections.join('\n\n') + '\n'
      });
      await vscode.window.showTextDocument(listDoc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
    }
  } else {
    vscode.window.showInformationMessage(message);
  }
}

async function applySpecToSource(source, spec) {
  const doc = await vscode.workspace.openTextDocument(source.uri);
  const isYaml = !/^\s*\{/.test(source.text);
  let newText = serialize(spec, isYaml);
  if (!/\n$/.test(source.text)) newText = newText.replace(/\n$/, '');
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount + 1, 0), newText);
  await vscode.workspace.applyEdit(edit);
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function convertCommand(uri) {
  let source;
  try {
    source = await loadSource(uri);
  } catch (e) {
    vscode.window.showErrorMessage(e.message);
    return;
  }

  let spec;
  try {
    spec = parseSpec(source.text);
  } catch (e) {
    vscode.window.showErrorMessage('Could not parse the file as JSON or YAML: ' + e.message);
    return;
  }

  const from = detectVersion(spec);

  if (!from) {
    const isYaml = await pickFormat('This is not a Swagger/OpenAPI specification.');
    if (isYaml === null) return;
    const content = serialize(spec, isYaml);
    await showResult(content, isYaml, source);
    await offerSaveBeside(source, content, isYaml, 'Format converted successfully.');
    return;
  }

  const exactFrom = detectExactVersion(spec);
  const fromLabel = from === '2.0' ? 'Swagger 2.0' : 'OpenAPI ' + exactFrom;
  if (!(from in LATEST_VERSION)) {
    vscode.window.showErrorMessage('Detected version ' + exactFrom + ' — newer than the supported ones (2.0, 3.0.x, 3.1.x, 3.2.x). Update the extension.');
    return;
  }

  const targets = [];
  const lineNames = { '2.0': 'Swagger', '3.0': 'OpenAPI 3.0.x', '3.1': 'OpenAPI 3.1.x', '3.2': 'OpenAPI 3.2.x' };
  for (const [line, versions] of Object.entries(OPENAPI_VERSIONS)) {
    targets.push({ label: lineNames[line], kind: vscode.QuickPickItemKind.Separator });
    for (const v of versions) {
      const label = v === '2.0' ? 'Swagger 2.0' : 'OpenAPI ' + v;
      let description;
      if (v === exactFrom) {
        description = 'Change format';
      } else if (line === from) {
        description = 'Version number update only — all ' + line + '.x releases are compatible';
      } else {
        description = 'Conversion from ' + fromLabel;
        if (line === '2.0' || (from === '3.2' && line !== '3.2')) description += ' (downgrade with a warning report)';
      }
      if (v === LATEST_VERSION[line] && line !== '2.0') description += ' · latest release of the ' + line + ' line';
      targets.push({ label, target: v, description });
    }
  }
  const targetPick = await vscode.window.showQuickPick(targets, {
    placeHolder: 'Actual version: ' + fromLabel + '. Convert to:'
  });
  if (!targetPick) return;

  const isYaml = await pickFormat('Format');
  if (isYaml === null) return;

  const tagStats = liftDescriptionTags(spec);

  let openapi, warnings;
  try {
    ({ openapi, warnings } = await convertSpec(spec, targetPick.target));
  } catch (e) {
    vscode.window.showErrorMessage('Conversion failed: ' + (e.message || String(e)));
    return;
  }

  if (warnings && warnings.length) {
    const pick = await vscode.window.showWarningMessage(
      'Conversion to ' + targetPick.label + ' finished with ' + warnings.length + ' warnings.',
      'Show warnings'
    );
    if (pick === 'Show warnings') {
      const doc = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: '# Conversion warnings: ' + fromLabel + ' → ' + targetPick.label + '\n\n' + warnings.map((w) => '- ' + w).join('\n') + '\n'
      });
      await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
    }
  }

  const content = serialize(canonicalOrder(openapi), isYaml);
  await showResult(content, isYaml, source);
  const lifted = tagStats.tagFields + tagStats.mediaSet;
  await offerSaveBeside(source, content, isYaml, 'Converted ' + fromLabel + ' → ' + targetPick.label + '.' +
    (lifted ? ' Moved ' + lifted + ' marker values into OpenAPI fields.' : ''));
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('openapiConverter.convert', convertCommand),
    vscode.commands.registerCommand('openapiConverter.applyMarkers', applyMarkersCommand)
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
