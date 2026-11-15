# Return a URL of a static Google Street View image

## Overview

The Street View Static API allows you to embed a non-interactive Street View
panorama or thumbnail into your web page or application using a standard HTTP
URL request without requiring JavaScript.

### Base URL Format

```http
https://maps.googleapis.com/maps/api/streetview?parameters
```

All parameters are separated using the ampersand (`&`) character.

--------------------------------------------------------------------------------

## Parameters

### Required Parameters

You must provide **either** `location` **or** `pano`, along with `size` and
`key`:

*   **`location`**: Either a text string (such as `Chagrin Falls, OH`) or a
    latitude/longitude coordinates pair (`40.457375,-80.009353`). Text strings
    must be URL-encoded (e.g., convert `"City Hall, New York, NY"` to
    `"City+Hall,New+York,NY"`).
    *   When an address string is provided, the API may choose a camera location
        to best display the specified location.
    *   When latitude/longitude coordinates are provided, the API searches a
        50-meter radius (by default) for the photograph closest to the location.
*   **`pano`**: A specific panorama ID.
    *   *Important*: Panorama IDs may change over time as imagery is refreshed.
        Do not persist `pano` IDs long-term. Instead, save the original
        `location` address or coordinates so you can search again and refresh
        the panorama ID if a request returns `ZERO_RESULTS` or no value.
*   **`size`**: The output size of the image in pixels, specified as
    `{width}x{height}` (for example, `size=600x400` returns an image 600 pixels
    wide by 400 pixels high).
*   **`key`**: Your application's Google Maps Platform API key.

### Optional Parameters

*   **`signature`** (*Recommended*): A digital signature used to verify that any
    site generating requests using your API key is authorized to do so. Requests
    without a digital signature might fail if your key settings or plan require
    it.
*   **`heading`**: The compass heading of the camera. Accepted values are from
    `0` to `360` (both `0` and `360` indicate North, `90` indicates East, `180`
    indicates South, and `270` indicates West). If omitted, a value is
    calculated that directs the camera towards the specified `location` from the
    point where the closest photograph was taken.
*   **`fov`** (*Default*: `90`): Determines the horizontal field of view of the
    image expressed in degrees, with a maximum allowed value of `120`. In a
    fixed-size viewport, field of view represents zoom, where smaller numbers
    indicate a higher level of zoom (e.g., `fov=20` is zoomed in, `fov=120` is
    wide-angle).
*   **`pitch`** (*Default*: `0`): Specifies the up or down angle of the camera
    relative to the Street View vehicle. Positive values angle the camera up (up
    to `90` degrees straight up); negative values angle the camera down (down to
    `-90` degrees straight down).
*   **`radius`** (*Default*: `50`): Sets a radius in meters in which to search
    for a panorama, centered on the given latitude and longitude. Valid values
    are non-negative integers.
*   **`return_error_code`**: Indicates whether the API should return an HTTP
    error code when no image is found (`404 NOT FOUND`) or in response to an
    invalid request (`400 BAD REQUEST`). Valid values are `true` and `false`. If
    set to `true`, an HTTP error is returned in place of the generic gray
    "Sorry, we have no imagery here." image.
*   **`source`** (*Default*: `default`): Limits Street View searches to selected
    sources. Valid values are:
    *   `default`: Uses the default sources for Street View; searches are not
        limited to specific sources.
    *   `outdoor`: Limits searches to outdoor collections where it is possible
        to determine whether they are indoors or outdoors (for example,
        PhotoSpheres are not returned because it is unknown whether they are
        indoors or outdoors).

--------------------------------------------------------------------------------

## Usage Examples

### 1. Direct URL Request (for HTML `<img>` tags)

When embedding the URL directly in an `<img>` tag or where custom HTTP headers
cannot be set, append `&solution_id=gmp_git_agentskills_v1` to the query
parameters:

```html
<img
  src="https://maps.googleapis.com/maps/api/streetview?size=600x300&location=46.414382,10.013988&heading=151.78&pitch=-0.76&return_error_code=true&key=YOUR_API_KEY&signature=YOUR_SIGNATURE&solution_id=gmp_git_agentskills_v1"
  alt="Street View of 46.414382, 10.013988"
  width="600"
  height="300"
/>
```

### 2. Programmatic URL Construction (JavaScript / Node.js)

Use `URLSearchParams` to safely URL-encode location strings and assemble
parameters:

```javascript
function generateStreetViewUrl({
  location,
  pano,
  size = '600x400',
  heading,
  fov = 90,
  pitch = 0,
  radius = 50,
  returnErrorCode = true,
  source = 'default',
  apiKey,
  signature
}) {
  const baseUrl = 'https://maps.googleapis.com/maps/api/streetview';
  const params = new URLSearchParams();

  if (location) {
    params.append('location', location);
  } else if (pano) {
    params.append('pano', pano);
  } else {
    throw new Error('Either "location" or "pano" must be provided.');
  }

  params.append('size', size);

  if (heading !== undefined) params.append('heading', heading.toString());
  if (fov !== undefined) params.append('fov', fov.toString());
  if (pitch !== undefined) params.append('pitch', pitch.toString());
  if (radius !== undefined) params.append('radius', radius.toString());
  if (returnErrorCode !== undefined) params.append('return_error_code', returnErrorCode.toString());
  if (source) params.append('source', source);

  params.append('key', apiKey);
  if (signature) {
    params.append('signature', signature);
  }

  // Append attribution parameter for legacy URL requests
  params.append('solution_id', 'gmp_git_agentskills_v1');

  return `${baseUrl}?${params.toString()}`;
}

// Example usage with an address string:
const imageUrl = generateStreetViewUrl({
  location: 'City Hall, New York, NY',
  size: '600x300',
  heading: 151.78,
  pitch: -0.76,
  returnErrorCode: true,
  apiKey: 'YOUR_API_KEY',
  signature: 'YOUR_SIGNATURE'
});

console.log(imageUrl);
```

### 3. Direct HTTP Request with Header Attribution

If fetching the image via an HTTP client (such as `curl` or backend code), you
can also include the `X-Goog-Maps-Solution-ID` header:

```bash
curl -L -G "https://maps.googleapis.com/maps/api/streetview" \
  -H "X-Goog-Maps-Solution-ID: gmp_git_agentskills_v1" \
  --data-urlencode "size=600x300" \
  --data-urlencode "location=City Hall, New York, NY" \
  --data-urlencode "fov=90" \
  --data-urlencode "heading=235" \
  --data-urlencode "pitch=10" \
  --data-urlencode "return_error_code=true" \
  --data-urlencode "key=YOUR_API_KEY" \
  --data-urlencode "solution_id=gmp_git_agentskills_v1" \
  --output streetview_image.jpg
```

--------------------------------------------------------------------------------

## Handling Missing Imagery & Errors

1.  **Preventing Generic Gray Images**: By default, if no Street View imagery is
    available at the requested location, the API returns a `200 OK` response
    with a generic gray image displaying `"Sorry, we have no imagery here."`.
    *   Set `return_error_code=true` so the API returns a `404 NOT FOUND` status
        instead, allowing your application or `<img onerror="...">` handler to
        gracefully fallback or hide the image element.
    *   Alternatively, query the
        [Street View Image Metadata](https://developers.google.com/maps/documentation/streetview/metadata)
        endpoint prior to loading the image to verify imagery availability
        (which does not incur Static Street View image load charges).
2.  **Refreshing Deleted Panorama IDs**: Because Street View imagery is
    periodically updated, photographs may be retaken from slightly different
    positions and assigned new panorama IDs. Always store the original
    `location` (address or `lat,lng`) in your database so you can re-query by
    `location` if a saved `pano` ID becomes invalid.
