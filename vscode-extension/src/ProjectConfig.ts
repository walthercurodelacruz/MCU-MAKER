/**
 * ProjectConfig — Reads mcu_maker.toml and diagram.json from the workspace.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import TOML from '@iarna/toml';
import type { McuMakerConfig, DiagramJson, BoardKind } from './types';

export class ProjectConfig {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /** Read and parse mcu_maker.toml from the workspace root */
  readMCU MakerToml(): McuMakerConfig | null {
    const tomlPath = path.join(this.workspaceRoot, 'mcu_maker.toml');
    if (!fs.existsSync(tomlPath)) return null;

    try {
      const content = fs.readFileSync(tomlPath, 'utf-8');
      const parsed = TOML.parse(content) as unknown as McuMakerConfig;
      return parsed;
    } catch (err) {
      vscode.window.showWarningMessage(`Failed to parse mcu_maker.toml: ${err}`);
      return null;
    }
  }

  /** Read and parse diagram.json from the workspace root */
  readDiagramJson(): DiagramJson | null {
    const jsonPath = path.join(this.workspaceRoot, 'diagram.json');
    if (!fs.existsSync(jsonPath)) return null;

    try {
      const content = fs.readFileSync(jsonPath, 'utf-8');
      return JSON.parse(content) as DiagramJson;
    } catch (err) {
      vscode.window.showWarningMessage(`Failed to parse diagram.json: ${err}`);
      return null;
    }
  }

  /** Resolve the board kind from config or settings */
  getBoard(): BoardKind {
    const config = this.readMCU MakerToml();
    if (config?.mcu_maker?.board) {
      return config.mcu_maker.board as BoardKind;
    }
    return vscode.workspace.getConfiguration('mcu_maker').get<BoardKind>('defaultBoard') ?? 'arduino-uno';
  }

  /** Get the language mode (arduino or micropython) */
  getLanguageMode(): 'arduino' | 'micropython' {
    const config = this.readMCU MakerToml();
    return config?.mcu_maker?.language ?? 'arduino';
  }

  /** Get the pre-compiled firmware path (if specified) */
  getFirmwarePath(): string | null {
    const config = this.readMCU MakerToml();
    if (!config?.mcu_maker?.firmware) return null;
    return path.resolve(this.workspaceRoot, config.mcu_maker.firmware);
  }

  /** Collect all sketch files (.ino, .h, .cpp, .py) from the workspace */
  async getSketchFiles(): Promise<Array<{ name: string; content: string }>> {
    const language = this.getLanguageMode();
    const pattern = language === 'micropython' ? '**/*.py' : '**/*.{ino,h,cpp,c}';
    const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
    const files: Array<{ name: string; content: string }> = [];

    for (const uri of uris) {
      const relativePath = path.relative(this.workspaceRoot, uri.fsPath);
      const content = fs.readFileSync(uri.fsPath, 'utf-8');
      files.push({ name: relativePath, content });
    }

    return files;
  }

  /** Create a default mcu_maker.toml in the workspace */
  async createDefaultConfig(board: BoardKind): Promise<void> {
    const tomlPath = path.join(this.workspaceRoot, 'mcu_maker.toml');
    const content = `[mcu_maker]\nversion = 1\nboard = "${board}"\n`;
    fs.writeFileSync(tomlPath, content, 'utf-8');
  }
}
