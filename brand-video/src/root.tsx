import { Composition } from "remotion";

import { HomeBrandLoop, LoginBrandLoop } from "./loops";

export function Root() {
    return (
        <>
            <Composition id="LoginBrandLoop" component={LoginBrandLoop} durationInFrames={240} fps={30} width={1080} height={1350} />
            <Composition id="HomeBrandLoop" component={HomeBrandLoop} durationInFrames={240} fps={30} width={1920} height={1080} />
        </>
    );
}
