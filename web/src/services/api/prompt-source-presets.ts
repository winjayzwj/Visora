import { nanoid } from "nanoid";

export type PromptSource = {
    id: string;
    name: string;
    url: string;
    homepage: string;
    enabled: boolean;
    builtIn: boolean;
};

export function createPromptSource(source?: Partial<PromptSource>): PromptSource {
    return {
        id: source?.id?.trim() || nanoid(),
        name: source?.name?.trim() || "",
        url: source?.url?.trim() || "",
        homepage: source?.homepage?.trim() || "",
        enabled: source?.enabled ?? true,
        builtIn: source?.builtIn ?? false,
    };
}

// These sources are the prompt library's catalogue, not product branding. Keeping
// their IDs stable also lets an existing browser cache survive product upgrades.
export const DEFAULT_PROMPT_SOURCES: PromptSource[] = [
    {
        id: "banana-prompt-quicker",
        name: "Banana Prompt Quicker",
        url: "https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources/banana-prompt-quicker.json",
        homepage: "https://glidea.github.io/banana-prompt-quicker/",
        enabled: true,
        builtIn: true,
    },
    {
        id: "davidwu-gpt-image2-prompts",
        name: "DavidWu GPT Image 2",
        url: "https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources/davidwu-gpt-image2-prompts.json",
        homepage: "https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts",
        enabled: true,
        builtIn: true,
    },
    {
        id: "freestylefly-gpt-image-2",
        name: "Freestylefly GPT Image 2",
        url: "https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources/freestylefly-gpt-image-2.json",
        homepage: "https://github.com/freestylefly/awesome-gpt-image-2",
        enabled: true,
        builtIn: true,
    },
    {
        id: "awesome-gpt-image",
        name: "Awesome GPT Image",
        url: "https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources/awesome-gpt-image.json",
        homepage: "https://github.com/ZeroLu/awesome-gpt-image",
        enabled: true,
        builtIn: true,
    },
    {
        id: "awesome-gpt4o-image-prompts",
        name: "Awesome GPT-4o",
        url: "https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources/awesome-gpt4o-image-prompts.json",
        homepage: "https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts",
        enabled: true,
        builtIn: true,
    },
    {
        id: "youmind-gpt-image-2",
        name: "YouMind GPT Image 2",
        url: "https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources/youmind-gpt-image-2.json",
        homepage: "https://github.com/YouMind-OpenLab/awesome-gpt-image-2",
        enabled: true,
        builtIn: true,
    },
    {
        id: "youmind-nano-banana-pro",
        name: "YouMind Nano Banana Pro",
        url: "https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources/youmind-nano-banana-pro.json",
        homepage: "https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts",
        enabled: true,
        builtIn: true,
    },
];
