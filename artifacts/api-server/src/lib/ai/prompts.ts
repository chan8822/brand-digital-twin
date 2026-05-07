export interface PromptDefinition<TContext = void> {
  name: string;
  version: string;
  build: (ctx: TContext) => string;
}

export function definePrompt<TContext = void>(
  def: PromptDefinition<TContext>,
): PromptDefinition<TContext> {
  return def;
}

export function composePrompt(
  base: string,
  ...sections: Array<string | null | undefined | false>
): string {
  return [base, ...sections.filter(Boolean)].join("\n\n").trim();
}
