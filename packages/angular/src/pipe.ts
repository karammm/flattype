import { Pipe, type PipeTransform } from "@angular/core";
import type { Parser } from "@flattype/http";

/**
 * Maps a value to a model in a template: `{{ (raw | flatModel: User).fullName }}`, or
 * `raw | flatModel: User : 'list'` for arrays. Pure, so it only re-runs when the input changes.
 * Returns `undefined` for `null` / `undefined` input; throws `ModelError` for invalid data.
 */
@Pipe({ name: "flatModel", standalone: true, pure: true })
export class FlatModelPipe implements PipeTransform {
  transform<T>(value: unknown, model: Parser<T>): T | undefined;
  transform<T>(value: unknown, model: Parser<T>, list: "list"): T[] | undefined;
  transform<T>(value: unknown, model: Parser<T>, list?: "list"): T | T[] | undefined {
    if (value == null) return undefined;
    return list === "list" ? model.parseList(value) : model.parse(value);
  }
}
