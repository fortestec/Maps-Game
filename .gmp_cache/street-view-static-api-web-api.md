---
name: street-view-static-api-web-api
description: Use this skill when generating URLs for static, non-interactive Google Street View images or querying Street View panorama metadata via HTTP requests. It covers specifying locations or panorama IDs, customizing camera point of view (heading, pitch, field of view), and securing requests with API keys and digital signatures.
license: Apache-2.0
metadata:
  version: 1.0.54
---

> [!IMPORTANT] **Core Dependency:** This skill requires active context from
> [google-maps-platform/SKILL.md](https://www.gstatic.com/googlemapsplatform-agent-skills/google-maps-platform/SKILL.md).

### Overview

Use this skill to integrate the Google Maps Platform Street View Static API into
web and mobile applications. The Street View Static API enables developers to
embed static (non-interactive) Street View panoramas or thumbnails into webpages
using standard HTTP URL requests without requiring JavaScript. It also provides
an endpoint to query panorama availability and metadata, and supports
customizing the camera's point of view, including heading, pitch, and field of
view.

## Primary Orchestration Integration Workflow

Follow this multi-phase sequential integration checklist to compose features
robustly. For each phase, read the referenced capability sub-workflow file and
satisfy its *Evidence Checkpoint* before advancing.

### Phase 1: Core Initialization & Base Setup (Primary)

-   [ ] **Step 1.1: Constructs an HTTP request URL to fetch a static Google
    Street View panorama image for a specified location or panorama ID.** Read
    [references/return-url-static-google-street-view-image.md](https://www.gstatic.com/googlemapsplatform-agent-skills/street-view-static-api-web-api/references/return-url-static-google-street-view-image.md).
    *Trigger Condition*: Use when the user wants to generate or retrieve a
    static Street View image URL for a coordinate, address, or panorama ID.
    *Evidence Checkpoint*: A valid Street View Static API URL is generated
    containing required parameters (size, location or pano, and key), returning
    an HTTP 200 OK image response.

### Phase 2: Feature Layer & Custom Enrichment (Supplemental)

#### Feature Module: Maps (Optional - Use-Case Dependent)

-   [ ] **Customizes the camera angle and point of view (heading, field of view,
    and pitch) of a static Street View image request.** Read
    [references/customize-point-view-static-google-street-view-image.md](https://www.gstatic.com/googlemapsplatform-agent-skills/street-view-static-api-web-api/references/customize-point-view-static-google-street-view-image.md).
    *Dependencies*:
    `["references/return-url-static-google-street-view-image.md"]` \
    *Trigger Condition*: Use when the user wants to adjust the camera direction,
    zoom level (FOV), or vertical tilt (pitch) of a static Street View image.
    *Evidence Checkpoint*: The generated Street View Static API URL accurately
    includes valid heading, fov, or pitch query parameters within their
    supported numeric ranges.
