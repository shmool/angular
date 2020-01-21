/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as tss from 'typescript/lib/tsserverlibrary';

import {getTemplateCompletions} from './completions';
import {getDefinitionAndBoundSpan, getTsDefinitionAndBoundSpan} from './definitions';
import {getDeclarationDiagnostics, getTemplateDiagnostics, ngDiagnosticToTsDiagnostic, uniqueBySpan} from './diagnostics';
import {getHover, getTsHover} from './hover';
import * as ng from './types';
import {TypeScriptServiceHost} from './typescript_host';

/**
 * Create an instance of an Angular `LanguageService`.
 *
 * @publicApi
 */
export function createLanguageService(host: TypeScriptServiceHost) {
  return new LanguageServiceImpl(host);
}

class LanguageServiceImpl implements ng.LanguageService {
  constructor(private readonly host: TypeScriptServiceHost) {}

  getSemanticDiagnostics(fileName: string): tss.Diagnostic[] {
    const analyzedModules = this.host.getAnalyzedModules();  // same role as 'synchronizeHostData'
    const results: ng.Diagnostic[] = [];
    const templates = this.host.getTemplates(fileName);

    for (const template of templates) {
      const ast = this.host.getTemplateAst(template);
      if (ast) {
        results.push(...getTemplateDiagnostics(ast));
      }
    }

    const declarations = this.host.getDeclarations(fileName);
    if (declarations && declarations.length) {
      results.push(...getDeclarationDiagnostics(declarations, analyzedModules, this.host));
    }

    const sourceFile = fileName.endsWith('.ts') ? this.host.getSourceFile(fileName) : undefined;
    return uniqueBySpan(results).map(d => ngDiagnosticToTsDiagnostic(d, sourceFile));
  }

  getCompletionsAtPosition(
      fileName: string, position: number,
      options?: tss.GetCompletionsAtPositionOptions): tss.CompletionInfo|undefined {
    this.host.getAnalyzedModules();  // same role as 'synchronizeHostData'
    const ast = this.host.getTemplateAstAtPosition(fileName, position);
    if (!ast) {
      return;
    }
    const results = getTemplateCompletions(ast, position);
    if (!results || !results.length) {
      return;
    }
    return {
      isGlobalCompletion: false,
      isMemberCompletion: false,
      isNewIdentifierLocation: false,
      // Cast CompletionEntry.kind from ng.CompletionKind to ts.ScriptElementKind
      entries: results as unknown as ts.CompletionEntry[],
    };
  }

  getDefinitionAndBoundSpan(fileName: string, position: number): tss.DefinitionInfoAndBoundSpan
      |undefined {
    this.host.getAnalyzedModules();  // same role as 'synchronizeHostData'
    const templateInfo = this.host.getTemplateAstAtPosition(fileName, position);
    if (templateInfo) {
      return getDefinitionAndBoundSpan(templateInfo, position);
    }

    // Attempt to get Angular-specific definitions in a TypeScript file, like templates defined
    // in a `templateUrl` property.
    if (fileName.endsWith('.ts')) {
      const sf = this.host.getSourceFile(fileName);
      if (sf) {
        return getTsDefinitionAndBoundSpan(sf, position, this.host.tsLsHost);
      }
    }
  }

  getQuickInfoAtPosition(fileName: string, position: number): tss.QuickInfo|undefined {
    this.host.getAnalyzedModules();  // same role as 'synchronizeHostData'
    const templateInfo = this.host.getTemplateAstAtPosition(fileName, position);
    if (templateInfo) {
      return getHover(templateInfo, position, this.host);
    }

    // Attempt to get Angular-specific hover information in a TypeScript file, the NgModule a
    // directive belongs to.
    if (fileName.endsWith('.ts')) {
      const sf = this.host.getSourceFile(fileName);
      if (sf) {
        return getTsHover(sf, position, this.host);
      }
    }
  }
}
