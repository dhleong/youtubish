import FormData from "form-data";

export function formDataFrom(map: undefined): undefined;
export function formDataFrom(map: Record<string, any>): FormData;
export function formDataFrom(map: Record<string, any> | undefined): FormData | undefined;
export function formDataFrom(map: Record<string, any> | undefined): FormData | undefined {
    if (!map) return;

    const form = new FormData();
    for (const k of Object.keys(map)) {
        const v = map[k];
        if (v) form.append(k, map[k]);
    }

    return form;
}
