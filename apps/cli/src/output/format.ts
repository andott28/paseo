export function printRows(lines: string[]): void {
  for (const line of lines) process.stdout.write(line + "\n");
}
