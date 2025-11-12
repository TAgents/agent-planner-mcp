#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

function copyRecursive(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursive(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function mergeSettings(existingPath, templatePath) {
  let existing = {};
  if (fs.existsSync(existingPath)) {
    existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
  }

  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

  // Merge permissions
  if (!existing.permissions) {
    existing.permissions = { allow: [] };
  }
  if (!existing.permissions.allow) {
    existing.permissions.allow = [];
  }

  // Add planning-system permissions if not already present
  template.permissions.allow.forEach(permission => {
    if (!existing.permissions.allow.includes(permission)) {
      existing.permissions.allow.push(permission);
    }
  });

  return existing;
}

async function main() {
  console.log('🚀 Agent Planner Claude Code Setup\n');
  console.log('This will install the autonomous execution orchestration system.\n');

  // Ask for target directory
  const defaultTarget = process.cwd();
  const target = await question(`Installation directory [${defaultTarget}]: `) || defaultTarget;

  const claudeDir = path.join(target, '.claude');
  const commandsDir = path.join(claudeDir, 'commands');
  const settingsPath = path.join(claudeDir, 'settings.local.json');

  // Show what will be installed
  console.log('\n📦 Will install:');
  console.log('  - Slash commands: /create-plan, /execute-plan, /plan-status');
  console.log('  - Documentation: AUTONOMOUS_EXECUTION_GUIDE.md');
  console.log('  - Settings: permissions for MCP planning-system tools\n');

  const confirm = await question('Proceed with installation? (y/n): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('Installation cancelled.');
    rl.close();
    return;
  }

  try {
    // Create .claude directory structure
    console.log('\n📁 Creating directory structure...');
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }
    if (!fs.existsSync(commandsDir)) {
      fs.mkdirSync(commandsDir, { recursive: true });
    }

    // Copy commands
    console.log('📝 Installing slash commands...');
    const sourceCommandsDir = path.join(__dirname, '..', 'claude-code', 'commands');
    copyRecursive(sourceCommandsDir, commandsDir);

    // Copy guide
    console.log('📚 Installing documentation...');
    const sourceGuide = path.join(__dirname, '..', 'claude-code', 'AUTONOMOUS_EXECUTION_GUIDE.md');
    const destGuide = path.join(claudeDir, 'AUTONOMOUS_EXECUTION_GUIDE.md');
    fs.copyFileSync(sourceGuide, destGuide);

    // Merge settings
    console.log('⚙️  Configuring permissions...');
    const templatePath = path.join(__dirname, '..', 'claude-code', 'settings.template.json');
    const mergedSettings = mergeSettings(settingsPath, templatePath);
    fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2));

    console.log('\n✅ Installation complete!\n');
    console.log('📖 Next steps:');
    console.log('  1. Ensure agent-planner-mcp is configured in your Claude Code MCP settings');
    console.log('  2. Read the guide: .claude/AUTONOMOUS_EXECUTION_GUIDE.md');
    console.log('  3. Create your first plan: /create-plan');
    console.log('  4. Execute autonomously: /execute-plan <plan-id>\n');
    console.log('🎯 Available commands:');
    console.log('  /create-plan   - Interactive plan builder');
    console.log('  /execute-plan  - Autonomous execution orchestrator');
    console.log('  /plan-status   - Progress monitoring\n');

  } catch (error) {
    console.error('\n❌ Installation failed:', error.message);
    process.exit(1);
  }

  rl.close();
}

main();
