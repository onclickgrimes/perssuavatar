Introduction
The Pexels API enables programmatic access to the full Pexels content library, including photos, videos. All content is available free of charge, and you are welcome to use Pexels content for anything you'd like, as long as it is within our Title.

The Pexels API is a RESTful JSON API, and you can interact with it from any language or framework with a HTTP library. Alternately, Pexels maintains some official Title you can use.

If you have any questions, please visit our Help Center for answers and troubleshooting.

Note: For historical reasons, all endpoints begin with https://api.pexels.com/v1/ except for video endpoints, which begin with https://api.pexels.com/videos/. Please see the individual endpoints listed below for more details about how to call each endpoint.

Guidelines
Whenever you are doing an API request make sure to show a prominent link to Pexels. You can use a text link (e.g. "Photos provided by Pexels") or a link with our logo.

Always credit our photographers when possible (e.g. "Photo by John Doe on Pexels" with a link to the photo page on Pexels).

You may not copy or replicate core functionality of Pexels (including making Pexels content available as a wallpaper app).

Do not abuse the API. By default, the API is rate-limited to 200 requests per hour and 20,000 requests per month. You may contact us to request a higher limit, but please include examples, or be prepared to give a demo, that clearly shows your use of the API with attribution. If you meet our API terms, you can get unlimited requests for free.

Abuse of the Pexels API, including but not limited to attempting to work around the rate limit, will lead to termination of your API access.

Linking back to Pexels

<a href="https://www.pexels.com">Photos provided by Pexels</a>

<!-- or show our white logo -->

<a href="https://www.pexels.com">
  <img src="https://images.pexels.com/lib/api/pexels-white.png" />
</a>

<!-- or show our black logo -->

<a href="https://www.pexels.com">
  <img src="https://images.pexels.com/lib/api/pexels.png" />
</a>
Linking back to a Photo
Copy
1
This <a href="https://www.pexels.com/photo/food-dinner-lunch-meal-4147875">Photo</a> was taken by <a href="https://www.pexels.com/@daria">Daria</a> on Pexels.
Client Libraries
Pexels maintains a number of official API client libraries that you can use to interact with the Pexels API:

Language	Package	Github	Changelog	Version
Ruby	rubygems	pexels-ruby	changelog	0.3.0
Javascript	npm	pexels-javascript	changelog	1.2.1
.net	nuget	PexelsDotNetSDK	changelog	1.0.6
Please read the documentation for the client library you'd like to use for more information about syntax (code samples for each library are available on this documentation). Issues and Pull Requests on Github are also welcome!

If you have created an unofficial Pexels API library for a different language please feel free to let us know about it!

Authorization
Authorization is required for the Pexels API. Anyone with a Pexels account can request an API key, which you will receive instantly.

All requests you make to the API will need to include your key. This is provided by adding an Authorization header.

Example of Authorization

Bash
Copy
1
2
curl -H "Authorization: YOUR_API_KEY" \
  "https://api.pexels.com/v1/search?query=people"
Request Statistics
To see how many requests you have left in your monthly quota, successful requests from the Pexels API include three HTTP headers:

Response Header	Meaning
X-Ratelimit-Limit	Your total request limit for the monthly period
X-Ratelimit-Remaining	How many of these requests remain
X-Ratelimit-Reset	UNIX timestamp of when the currently monthly period will roll over
Note: These response headers are only returned on successful (2xx) responses. They are not included with other responses, including 429 Too Many Requests, which indicates you have exceeded your rate limit. Please be sure to keep track of X-Ratelimit-Remaining and X-Ratelimit-Reset in order to manage your request limit.

Example of Rate Limit Headers
Copy
1
2
3
X-Ratelimit-Limit: 20000
X-Ratelimit-Remaining: 19684
X-Ratelimit-Reset: 1590529646
Pagination
Most Pexels API requests return multiple records at once. All of these endpoints are paginated, and can return a maximum of 80 requests at one time. Each paginated request accepts the same parameters and returns the same pagination data in the response.

Note: The prev_page and next_page response attributes will only be returned if there is a corresponding page.

Pagination Request Parameters
Copy
GET https://api.pexels.com/v1/curated?page=2&per_page=40
Pagination Response Attributes
Copy
{
  "page": 2,
  "per_page": 40,
  "total_results": 8000,
  "next_page": "https://api.pexels.com/v1/curated?page=3&per_page=40",
  "prev_page": "https://api.pexels.com/v1/curated?page=1&per_page=40"
}
The Photo Resource
The Photo resource is a JSON formatted version of a Pexels photo. The Photo API endpoints respond with the photo data formatted in this shape.

Response
id integer
The id of the photo.

width integer
The real width of the photo in pixels.

height integer
The real height of the photo in pixels.

url string
The Pexels URL where the photo is located.

photographer string
The name of the photographer who took the photo.

photographer_url string
The URL of the photographer's Pexels profile.

photographer_id integer
The id of the photographer.

avg_color string
The average color of the photo. Useful for a placeholder while the image loads.

src object
An assortment of different image sizes that can be used to display this Photo.


Show Children
alt string
Text description of the photo for use in the alt attribute.

The Photo Resource

{
  "id": 2014422,
  "width": 3024,
  "height": 3024,
  "url": "https://www.pexels.com/photo/brown-rocks-during-golden-hour-2014422/",
  "photographer": "Joey Farina",
  "photographer_url": "https://www.pexels.com/@joey",
  "photographer_id": 680589,
  "avg_color": "#978E82",
  "src": {
    "original": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg",
    "large2x": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    "large": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
    "medium": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&h=350",
    "small": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&h=130",
    "portrait": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800",
    "landscape": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    "tiny": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280"
  },
  "liked": false,
  "alt": "Brown Rocks During Golden Hour"
}
Search for Photos
GET https://api.pexels.com/v1/search
This endpoint enables you to search Pexels for any topic that you would like. For example your query could be something broad like Nature, Tigers, People. Or it could be something specific like Group of people working.

Parameters
query string | required
The search query. Ocean, Tigers, Pears, etc.

orientation string | optional
Desired photo orientation. The current supported orientations are: landscape, portrait or square.

size string | optional
Minimum photo size. The current supported sizes are: large(24MP), medium(12MP) or small(4MP).

color string | optional
Desired photo color. Supported colors: red, orange, yellow, green, turquoise, blue, violet, pink, brown, black, gray, white or any hexidecimal color code (eg. #ffffff).

locale string | optional
The locale of the search you are performing. The current supported locales are: en-US, pt-BR, es-ES, ca-ES, de-DE, it-IT, fr-FR, sv-SE, id-ID, pl-PL, ja-JP, zh-TW, zh-CN, ko-KR, th-TH, nl-NL, hu-HU, vi-VN, cs-CZ, da-DK, fi-FI, uk-UA, el-GR, ro-RO, nb-NO, sk-SK, tr-TR, ru-RU.

page integer | optional
The page number you are requesting. Default: 1

per_page integer | optional
The number of results you are requesting per page. Default: 15 Max: 80

Response
photos array of Photo
An array of Photo objects.

page integer
The current page number.

per_page integer
The number of results returned with each page.

total_results integer
The total number of results for the request.

prev_page string | optional
URL for the previous page of results, if applicable.

next_page string | optional
URL for the next page of results, if applicable.

Example Request

Bash
Copy
1
2
curl -H "Authorization: YOUR_API_KEY" \
  "https://api.pexels.com/v1/search?query=nature&per_page=1"
Example Response
{
  "total_results": 10000,
  "page": 1,
  "per_page": 1,
  "photos": [
    {
      "id": 3573351,
      "width": 3066,
      "height": 3968,
      "url": "https://www.pexels.com/photo/trees-during-day-3573351/",
      "photographer": "Lukas Rodriguez",
      "photographer_url": "https://www.pexels.com/@lukas-rodriguez-1845331",
      "photographer_id": 1845331,
      "avg_color": "#374824",
      "src": {
        "original": "https://images.pexels.com/photos/3573351/pexels-photo-3573351.png",
        "large2x": "https://images.pexels.com/photos/3573351/pexels-photo-3573351.png?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "large": "https://images.pexels.com/photos/3573351/pexels-photo-3573351.png?auto=compress&cs=tinysrgb&h=650&w=940",
        "medium": "https://images.pexels.com/photos/3573351/pexels-photo-3573351.png?auto=compress&cs=tinysrgb&h=350",
        "small": "https://images.pexels.com/photos/3573351/pexels-photo-3573351.png?auto=compress&cs=tinysrgb&h=130",
        "portrait": "https://images.pexels.com/photos/3573351/pexels-photo-3573351.png?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800",
        "landscape": "https://images.pexels.com/photos/3573351/pexels-photo-3573351.png?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
        "tiny": "https://images.pexels.com/photos/3573351/pexels-photo-3573351.png?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280"
      },
      "liked": false,
      "alt": "Brown Rocks During Golden Hour"
    }
  ],
  "next_page": "https://api.pexels.com/v1/search/?page=2&per_page=1&query=nature"
}
Curated Photos
GET https://api.pexels.com/v1/curated
This endpoint enables you to receive real-time photos curated by the Pexels team.

We add at least one new photo per hour to our curated list so that you always get a changing selection of trending photos.

Parameters
page integer | optional
The page number you are requesting. Default: 1

per_page integer | optional
The number of results you are requesting per page. Default: 15 Max: 80

Response
photos array of Photo
An array of Photo objects.

page integer
The current page number.

per_page integer
The number of results returned with each page.

total_results integer
The total number of results for the request.

prev_page string | optional
URL for the previous page of results, if applicable.

next_page string | optional
URL for the next page of results, if applicable.

Example Request

Bash
Copy
1
2
curl -H "Authorization: YOUR_API_KEY" \
  "https://api.pexels.com/v1/curated?per_page=1"
Example Response

{
  "page": 1,
  "per_page": 1,
  "photos": [
    {
      "id": 2880507,
      "width": 4000,
      "height": 6000,
      "url": "https://www.pexels.com/photo/woman-in-white-long-sleeved-top-and-skirt-standing-on-field-2880507/",
      "photographer": "Deden Dicky Ramdhani",
      "photographer_url": "https://www.pexels.com/@drdeden88",
      "photographer_id": 1378810,
      "avg_color": "#7E7F7B",
      "src": {
        "original": "https://images.pexels.com/photos/2880507/pexels-photo-2880507.jpeg",
        "large2x": "https://images.pexels.com/photos/2880507/pexels-photo-2880507.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "large": "https://images.pexels.com/photos/2880507/pexels-photo-2880507.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
        "medium": "https://images.pexels.com/photos/2880507/pexels-photo-2880507.jpeg?auto=compress&cs=tinysrgb&h=350",
        "small": "https://images.pexels.com/photos/2880507/pexels-photo-2880507.jpeg?auto=compress&cs=tinysrgb&h=130",
        "portrait": "https://images.pexels.com/photos/2880507/pexels-photo-2880507.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800",
        "landscape": "https://images.pexels.com/photos/2880507/pexels-photo-2880507.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
        "tiny": "https://images.pexels.com/photos/2880507/pexels-photo-2880507.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280"
      },
      "liked": false,
      "alt": "Brown Rocks During Golden Hour"
    }
  ],
  "next_page": "https://api.pexels.com/v1/curated/?page=2&per_page=1"
}
Get a Photo
GET https://api.pexels.com/v1/photos/:id
Retrieve a specific Photo from its id.

Parameters
id integer | required
The id of the photo you are requesting.

Response
Returns a Photo object

Example Request

Bash
Copy
1
2
curl -H "Authorization: YOUR_API_KEY" \
  "https://api.pexels.com/v1/photos/2014422"
Example Response
{
  "id": 2014422,
  "width": 3024,
  "height": 3024,
  "url": "https://www.pexels.com/photo/brown-rocks-during-golden-hour-2014422/",
  "photographer": "Joey Farina",
  "photographer_url": "https://www.pexels.com/@joey",
  "photographer_id": 680589,
  "avg_color": "#978E82",
  "src": {
    "original": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg",
    "large2x": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    "large": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
    "medium": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&h=350",
    "small": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&h=130",
    "portrait": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800",
    "landscape": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
    "tiny": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=280"
  },
  "liked": false,
  "alt": "Brown Rocks During Golden Hour"
}
The Video Resource
The Video resource is a JSON formatted version of a Pexels video. The Video API endpoints respond with the video data formatted in this shape.

Response
id integer
The id of the video.

width integer
The real width of the video in pixels.

height integer
The real height of the video in pixels.

url string
The Pexels URL where the video is located.

image string
URL to a screenshot of the video.

duration integer
The duration of the video in seconds.

user object
The videographer who shot the video.


Show Children
video_files Array of objects
An array of different sized versions of the video.


Show Children
video_pictures Array of objects
An array of preview pictures of the video.


Show Children
The Video Resource
{
  "id": 2499611,
  "width": 1080,
  "height": 1920,
  "url": "https://www.pexels.com/video/2499611/",
  "image": "https://images.pexels.com/videos/2499611/free-video-2499611.jpg?fit=crop&w=1200&h=630&auto=compress&cs=tinysrgb",
  "full_res": null,
  "tags": [],
  "duration": 22,
  "user": {
    "id": 680589,
    "name": "Joey Farina",
    "url": "https://www.pexels.com/@joey"
  },
  "video_files": [
    {
      "id": 125004,
      "quality": "hd",
      "file_type": "video/mp4",
      "width": 1080,
      "height": 1920,
      "fps": 23.976,
      "link": "https://player.vimeo.com/external/342571552.hd.mp4?s=6aa6f164de3812abadff3dde86d19f7a074a8a66&profile_id=175&oauth2_token_id=57447761"
    },
    {
      "id": 125005,
      "quality": "sd",
      "file_type": "video/mp4",
      "width": 540,
      "height": 960,
      "fps": 23.976,
      "link": "https://player.vimeo.com/external/342571552.sd.mp4?s=e0df43853c25598dfd0ec4d3f413bce1e002deef&profile_id=165&oauth2_token_id=57447761"
    },
    {
      "id": 125006,
      "quality": "sd",
      "file_type": "video/mp4",
      "width": 240,
      "height": 426,
      "fps": 23.976,
      "link": "https://player.vimeo.com/external/342571552.sd.mp4?s=e0df43853c25598dfd0ec4d3f413bce1e002deef&profile_id=139&oauth2_token_id=57447761"
    }
    ...
  ],
  "video_pictures": [
    {
      "id": 308178,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-0.jpg",
      "nr": 0
    },
    {
      "id": 308179,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-1.jpg",
      "nr": 1
    },
    {
      "id": 308180,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-2.jpg",
      "nr": 2
    },
    {
      "id": 308181,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-3.jpg",
      "nr": 3
    }
    ...
  ]
}
Search for Videos
GET https://api.pexels.com/videos/search
This endpoint enables you to search Pexels for any topic that you would like. For example your query could be something broad like Nature, Tigers, People. Or it could be something specific like Group of people working.

Parameters
query string | required
The search query. Ocean, Tigers, Pears, etc.

orientation string | optional
Desired video orientation. The current supported orientations are: landscape, portrait or square.

size string | optional
Minimum video size. The current supported sizes are: large(4K), medium(Full HD) or small(HD).

locale string | optional
The locale of the search you are performing. The current supported locales are: en-US, pt-BR, es-ES, ca-ES, de-DE, it-IT, fr-FR, sv-SE, id-ID, pl-PL, ja-JP, zh-TW, zh-CN, ko-KR, th-TH, nl-NL, hu-HU, vi-VN, cs-CZ, da-DK, fi-FI, uk-UA, el-GR, ro-RO, nb-NO, sk-SK, tr-TR, ru-RU.

page integer | optional
The page number you are requesting. Default: 1

per_page integer | optional
The number of results you are requesting per page. Default: 15 Max: 80

Response
videos array of Video
An array of Video objects.

url string
The Pexels URL for the current search query.

page integer
The current page number.

per_page integer
The number of results returned with each page.

total_results integer
The total number of results for the request.

prev_page string | optional
URL for the previous page of results, if applicable.

next_page string | optional
URL for the next page of results, if applicable.

Example Request

Bash
Copy
1
2
curl -H "Authorization: YOUR_API_KEY" \
  "https://api.pexels.com/videos/search?query=nature&per_page=1"
Example Response

{
  "page": 1,
  "per_page": 1,
  "total_results": 20475,
  "url": "https://www.pexels.com/videos/",
  "videos": [
    {
      "id": 1448735,
      "width": 4096,
      "height": 2160,
      "url": "https://www.pexels.com/video/video-of-forest-1448735/",
      "image": "https://images.pexels.com/videos/1448735/free-video-1448735.jpg?fit=crop&w=1200&h=630&auto=compress&cs=tinysrgb",
      "duration": 32,
      "user": {
        "id": 574687,
        "name": "Ruvim Miksanskiy",
        "url": "https://www.pexels.com/@digitech"
      },
      "video_files": [
        {
          "id": 58649,
          "quality": "sd",
          "file_type": "video/mp4",
          "width": 640,
          "height": 338,
          "link": "https://player.vimeo.com/external/291648067.sd.mp4?s=7f9ee1f8ec1e5376027e4a6d1d05d5738b2fbb29&profile_id=164&oauth2_token_id=57447761"
        },
        {
          "id": 58650,
          "quality": "hd",
          "file_type": "video/mp4",
          "width": 2048,
          "height": 1080,
          "link": "https://player.vimeo.com/external/291648067.hd.mp4?s=94998971682c6a3267e4cbd19d16a7b6c720f345&profile_id=175&oauth2_token_id=57447761"
        },
        {
          "id": 58651,
          "quality": "hd",
          "file_type": "video/mp4",
          "width": 4096,
          "height": 2160,
          "link": "https://player.vimeo.com/external/291648067.hd.mp4?s=94998971682c6a3267e4cbd19d16a7b6c720f345&profile_id=172&oauth2_token_id=57447761"
        },
        {
          "id": 58652,
          "quality": "hd",
          "file_type": "video/mp4",
          "width": 1366,
          "height": 720,
          "link": "https://player.vimeo.com/external/291648067.hd.mp4?s=94998971682c6a3267e4cbd19d16a7b6c720f345&profile_id=174&oauth2_token_id=57447761"
        },
        {
          "id": 58653,
          "quality": "hd",
          "file_type": "video/mp4",
          "width": 2732,
          "height": 1440,
          "link": "https://player.vimeo.com/external/291648067.hd.mp4?s=94998971682c6a3267e4cbd19d16a7b6c720f345&profile_id=170&oauth2_token_id=57447761"
        },
        {
          "id": 58654,
          "quality": "sd",
          "file_type": "video/mp4",
          "width": 960,
          "height": 506,
          "link": "https://player.vimeo.com/external/291648067.sd.mp4?s=7f9ee1f8ec1e5376027e4a6d1d05d5738b2fbb29&profile_id=165&oauth2_token_id=57447761"
        },
        {
          "id": 58655,
          "quality": "hls",
          "file_type": "video/mp4",
          "width": null,
          "height": null,
          "link": "https://player.vimeo.com/external/291648067.m3u8?s=1210fac9d80f9b74b4a334c4fca327cde08886b2&oauth2_token_id=57447761"
        }
      ],
      "video_pictures": [
        {
          "id": 133236,
          "picture": "https://static-videos.pexels.com/videos/1448735/pictures/preview-0.jpg",
          "nr": 0
        },
        {
          "id": 133237,
          "picture": "https://static-videos.pexels.com/videos/1448735/pictures/preview-1.jpg",
          "nr": 1
        },
        {
          "id": 133238,
          "picture": "https://static-videos.pexels.com/videos/1448735/pictures/preview-2.jpg",
          "nr": 2
        },
        {
          "id": 133239,
          "picture": "https://static-videos.pexels.com/videos/1448735/pictures/preview-3.jpg",
          "nr": 3
        },
        {
          "id": 133240,
          "picture": "https://static-videos.pexels.com/videos/1448735/pictures/preview-4.jpg",
          "nr": 4
        },
        {
          "id": 133241,
          "picture": "https://static-videos.pexels.com/videos/1448735/pictures/preview-5.jpg",
          "nr": 5
        },
        {
          "id": 133242,
          "picture": "https://static-videos.pexels.com/videos/1448735/pictures/preview-6.jpg",
          "nr": 6
        },
        {
          "id": 133243,
          "picture": "https://static-videos.pexels.com/videos/1448735/pictures/preview-7.jpg",
          "nr": 7
        },
        {
          "id": 133244,
          "picture": "https://static-videos.pexels.com/videos/1448735/pictures/preview-8.jpg",
          "nr": 8
        },
        {
          "id": 133245,
          "picture": "https://static-videos.pexels.com/videos/1448735/pictures/preview-9.jpg",
          "nr": 9
        },
        {
          "id": 133246,
          "picture": "https://static-videos.pexels.com/videos/1448735/pictures/preview-10.jpg",
          "nr": 10
        },
        {
          "id": 133247,
          "picture": "https://static-videos.pexels.com/videos/1448735/pictures/preview-11.jpg",
          "nr": 11
        },
        {
          "id": 133248,
          "picture": "https://static-videos.pexels.com/videos/1448735/pictures/preview-12.jpg",
          "nr": 12
        },
        {
          "id": 133249,
          "picture": "https://static-videos.pexels.com/videos/1448735/pictures/preview-13.jpg",
          "nr": 13
        },
        {
          "id": 133250,
          "picture": "https://static-videos.pexels.com/videos/1448735/pictures/preview-14.jpg",
          "nr": 14
        }
      ]
    }
  ]
}
Popular Videos
GET https://api.pexels.com/videos/popular
This endpoint enables you to receive the current popular Pexels videos.

Parameters
min_width integer | optional
The minimum width in pixels of the returned videos.

min_height integer | optional
The minimum height in pixels of the returned videos.

min_duration integer | optional
The minimum duration in seconds of the returned videos.

max_duration integer | optional
The maximum duration in seconds of the returned videos.

page integer | optional
The page number you are requesting. Default: 1

per_page integer | optional
The number of results you are requesting per page. Default: 15 Max: 80

Response
videos array of Video
An array of Video objects.

url string
The Pexels URL for the current page.

page integer
The current page number.

per_page integer
The number of results returned with each page.

total_results integer
The total number of results for the request.

prev_page string | optional
URL for the previous page of results, if applicable.

next_page string | optional
URL for the next page of results, if applicable.

Example Request

Bash

curl -H "Authorization: YOUR_API_KEY" \
  "https://api.pexels.com/videos/popular?per_page=1"
Example Response
{
  "page": 1,
  "per_page": 1,
  "total_results": 4089,
  "url": "https://www.pexels.com/search/videos/Nature/",
  "videos": [
    {
      "id": 1093662,
      "width": 1920,
      "height": 1080,
      "url": "https://www.pexels.com/video/water-crashing-over-the-rocks-1093662/",
      "image": "https://images.pexels.com/videos/1093662/free-video-1093662.jpg?fit=crop&w=1200&h=630&auto=compress&cs=tinysrgb",
      "duration": 8,
      "user": {
        "id": 417939,
        "name": "Peter Fowler",
        "url": "https://www.pexels.com/@peter-fowler-417939"
      },
      "video_files": [
        {
          "id": 37101,
          "quality": "hd",
          "file_type": "video/mp4",
          "width": 1280,
          "height": 720,
          "link": "https://player.vimeo.com/external/269971860.hd.mp4?s=eae965838585cc8342bb5d5253d06a52b2415570&profile_id=174&oauth2_token_id=57447761"
        },
        {
          "id": 37102,
          "quality": "sd",
          "file_type": "video/mp4",
          "width": 640,
          "height": 360,
          "link": "https://player.vimeo.com/external/269971860.sd.mp4?s=a3036bd1a9f15c1b31daedad98c06a3b24cdd747&profile_id=164&oauth2_token_id=57447761"
        },
        {
          "id": 37103,
          "quality": "hd",
          "file_type": "video/mp4",
          "width": 1920,
          "height": 1080,
          "link": "https://player.vimeo.com/external/269971860.hd.mp4?s=eae965838585cc8342bb5d5253d06a52b2415570&profile_id=175&oauth2_token_id=57447761"
        },
        {
          "id": 37104,
          "quality": "sd",
          "file_type": "video/mp4",
          "width": 960,
          "height": 540,
          "link": "https://player.vimeo.com/external/269971860.sd.mp4?s=a3036bd1a9f15c1b31daedad98c06a3b24cdd747&profile_id=165&oauth2_token_id=57447761"
        },
        {
          "id": 37105,
          "quality": "hls",
          "file_type": "video/mp4",
          "width": null,
          "height": null,
          "link": "https://player.vimeo.com/external/269971860.m3u8?s=ac08929c597387cc77ae3d88bfe2ad66a9c4d31f&oauth2_token_id=57447761"
        }
      ],
      "video_pictures": [
        {
          "id": 79696,
          "picture": "https://static-videos.pexels.com/videos/1093662/pictures/preview-0.jpg",
          "nr": 0
        },
        {
          "id": 79697,
          "picture": "https://static-videos.pexels.com/videos/1093662/pictures/preview-1.jpg",
          "nr": 1
        },
        {
          "id": 79698,
          "picture": "https://static-videos.pexels.com/videos/1093662/pictures/preview-2.jpg",
          "nr": 2
        },
        {
          "id": 79699,
          "picture": "https://static-videos.pexels.com/videos/1093662/pictures/preview-3.jpg",
          "nr": 3
        },
        {
          "id": 79700,
          "picture": "https://static-videos.pexels.com/videos/1093662/pictures/preview-4.jpg",
          "nr": 4
        },
        {
          "id": 79701,
          "picture": "https://static-videos.pexels.com/videos/1093662/pictures/preview-5.jpg",
          "nr": 5
        },
        {
          "id": 79702,
          "picture": "https://static-videos.pexels.com/videos/1093662/pictures/preview-6.jpg",
          "nr": 6
        },
        {
          "id": 79703,
          "picture": "https://static-videos.pexels.com/videos/1093662/pictures/preview-7.jpg",
          "nr": 7
        },
        {
          "id": 79704,
          "picture": "https://static-videos.pexels.com/videos/1093662/pictures/preview-8.jpg",
          "nr": 8
        },
        {
          "id": 79705,
          "picture": "https://static-videos.pexels.com/videos/1093662/pictures/preview-9.jpg",
          "nr": 9
        },
        {
          "id": 79706,
          "picture": "https://static-videos.pexels.com/videos/1093662/pictures/preview-10.jpg",
          "nr": 10
        },
        {
          "id": 79707,
          "picture": "https://static-videos.pexels.com/videos/1093662/pictures/preview-11.jpg",
          "nr": 11
        },
        {
          "id": 79708,
          "picture": "https://static-videos.pexels.com/videos/1093662/pictures/preview-12.jpg",
          "nr": 12
        },
        {
          "id": 79709,
          "picture": "https://static-videos.pexels.com/videos/1093662/pictures/preview-13.jpg",
          "nr": 13
        },
        {
          "id": 79710,
          "picture": "https://static-videos.pexels.com/videos/1093662/pictures/preview-14.jpg",
          "nr": 14
        }
      ]
    }
  ]
}
Get a Video
GET https://api.pexels.com/videos/videos/:id
Retrieve a specific Video from its id.

Parameters
id integer | required
The id of the video you are requesting.

Response
Returns a Video object

Example Request

Bash
Copy
1
2
curl -H "Authorization: YOUR_API_KEY" \
  "https://api.pexels.com/videos/videos/2499611"
Example Response
{
  "id": 2499611,
  "width": 1080,
  "height": 1920,
  "url": "https://www.pexels.com/video/2499611/",
  "image": "https://images.pexels.com/videos/2499611/free-video-2499611.jpg?fit=crop&w=1200&h=630&auto=compress&cs=tinysrgb",
  "duration": 22,
  "user": {
    "id": 680589,
    "name": "Joey Farina",
    "url": "https://www.pexels.com/@joey"
  },
  "video_files": [
    {
      "id": 125004,
      "quality": "hd",
      "file_type": "video/mp4",
      "width": 1080,
      "height": 1920,
      "link": "https://player.vimeo.com/external/342571552.hd.mp4?s=6aa6f164de3812abadff3dde86d19f7a074a8a66&profile_id=175&oauth2_token_id=57447761"
    },
    {
      "id": 125005,
      "quality": "sd",
      "file_type": "video/mp4",
      "width": 540,
      "height": 960,
      "link": "https://player.vimeo.com/external/342571552.sd.mp4?s=e0df43853c25598dfd0ec4d3f413bce1e002deef&profile_id=165&oauth2_token_id=57447761"
    },
    {
      "id": 125006,
      "quality": "sd",
      "file_type": "video/mp4",
      "width": 240,
      "height": 426,
      "link": "https://player.vimeo.com/external/342571552.sd.mp4?s=e0df43853c25598dfd0ec4d3f413bce1e002deef&profile_id=139&oauth2_token_id=57447761"
    },
    {
      "id": 125007,
      "quality": "hd",
      "file_type": "video/mp4",
      "width": 720,
      "height": 1280,
      "link": "https://player.vimeo.com/external/342571552.hd.mp4?s=6aa6f164de3812abadff3dde86d19f7a074a8a66&profile_id=174&oauth2_token_id=57447761"
    },
    {
      "id": 125008,
      "quality": "sd",
      "file_type": "video/mp4",
      "width": 360,
      "height": 640,
      "link": "https://player.vimeo.com/external/342571552.sd.mp4?s=e0df43853c25598dfd0ec4d3f413bce1e002deef&profile_id=164&oauth2_token_id=57447761"
    },
    {
      "id": 125009,
      "quality": "hls",
      "file_type": "video/mp4",
      "width": null,
      "height": null,
      "link": "https://player.vimeo.com/external/342571552.m3u8?s=53433233e4176eead03ddd6fea04d9fb2bce6637&oauth2_token_id=57447761"
    }
  ],
  "video_pictures": [
    {
      "id": 308178,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-0.jpg",
      "nr": 0
    },
    {
      "id": 308179,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-1.jpg",
      "nr": 1
    },
    {
      "id": 308180,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-2.jpg",
      "nr": 2
    },
    {
      "id": 308181,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-3.jpg",
      "nr": 3
    },
    {
      "id": 308182,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-4.jpg",
      "nr": 4
    },
    {
      "id": 308183,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-5.jpg",
      "nr": 5
    },
    {
      "id": 308184,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-6.jpg",
      "nr": 6
    },
    {
      "id": 308185,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-7.jpg",
      "nr": 7
    },
    {
      "id": 308186,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-8.jpg",
      "nr": 8
    },
    {
      "id": 308187,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-9.jpg",
      "nr": 9
    },
    {
      "id": 308188,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-10.jpg",
      "nr": 10
    },
    {
      "id": 308189,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-11.jpg",
      "nr": 11
    },
    {
      "id": 308190,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-12.jpg",
      "nr": 12
    },
    {
      "id": 308191,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-13.jpg",
      "nr": 13
    },
    {
      "id": 308192,
      "picture": "https://static-videos.pexels.com/videos/2499611/pictures/preview-14.jpg",
      "nr": 14
    }
  ]
}
Overview
Pexels Collections are a way to group specific photos and videos into one unified gallery. This can be useful if, for example, you want to expose a specific subset of Pexels content to your users. You can access all your collections and the media within them via the Pexels API.

Note: Collections cannot be created or modified using the Pexels API. Rather, you can manage your collections on the Pexels website, iOS or Android app. API only gives you access to featured collections and your own collections.

The Collection Resource
The Collection resource is a JSON formatted version of a Pexels collection. The Collection list endpoint responds with the collection data formatted in this shape.

Response
id string
The id of the collection.

title string
The name of the collection.

description string
The description of the collection.

private boolean
Whether or not the collection is marked as private.

media_count integer
The total number of media included in this collection.

photos_count integer
The total number of photos included in this collection.

videos_count integer
The total number of videos included in this collection.

The Collection Resource
Copy
1
2
3
4
5
6
7
8
9
{
  "id": "8xntbhr",
  "title": "Hello Spring",
  "description": "Baby chicks, rabbits & pretty flowers. What's not to love?",
  "private": false,
  "media_count": 130,
  "photos_count": 121,
  "videos_count": 9
}
Featured Collections
GET https://api.pexels.com/v1/collections/featured
This endpoint returns all featured collections on Pexels.

Parameters
page integer | optional
The page number you are requesting. Default: 1

per_page integer | optional
The number of results you are requesting per page. Default: 15 Max: 80

Response
collections array of Collection
An array of Collection objects.

page integer
The current page number.

per_page integer
The number of results returned with each page.

total_results integer
The total number of results for the request.

prev_page string | optional
URL for the previous page of results, if applicable.

next_page string | optional
URL for the next page of results, if applicable.

Example Request

Bash
Copy
1
2
curl -H "Authorization: YOUR_API_KEY" \
  "https://api.pexels.com/v1/collections/featured?per_page=1"
Example Response

{
  "collections": [
    {
      "id": "9mp14cx",
      "title": "Cool Cats",
      "description": null,
      "private": false,
      "media_count": 6,
      "photos_count": 5,
      "videos_count": 1
    }
  ],

  "page": 2,
  "per_page": 1,
  "total_results": 5,
  "next_page": "https://api.pexels.com/v1/collections/featured/?page=3&per_page=1",
  "prev_page": "https://api.pexels.com/v1/collections/featured?page=1&per_page=1"
}
My Collections
GET https://api.pexels.com/v1/collections
This endpoint returns all of your collections.

Parameters
page integer | optional
The page number you are requesting. Default: 1

per_page integer | optional
The number of results you are requesting per page. Default: 15 Max: 80

Response
collections array of Collection
An array of Collection objects.

page integer
The current page number.

per_page integer
The number of results returned with each page.

total_results integer
The total number of results for the request.

prev_page string | optional
URL for the previous page of results, if applicable.

next_page string | optional
URL for the next page of results, if applicable.

Example Request

Bash
Copy
1
2
curl -H "Authorization: YOUR_API_KEY" \
  "https://api.pexels.com/v1/collections?per_page=1"
Example Response

{
  "collections": [
    {
      "id": "9mp14cx",
      "title": "Cool Cats",
      "description": null,
      "private": false,
      "media_count": 6,
      "photos_count": 5,
      "videos_count": 1
    }
  ],

  "page": 2,
  "per_page": 1,
  "total_results": 5,
  "next_page": "https://api.pexels.com/v1/collections/?page=3&per_page=1",
  "prev_page": "https://api.pexels.com/v1/collections/?page=1&per_page=1"
}
Collection Media
GET https://api.pexels.com/v1/collections/:id
This endpoint returns all the media (photos and videos) within a single collection. You can filter to only receive photos or videos using the type parameter.

Parameters
type string | optional
The type of media you are requesting. If not given or if given with an invalid value, all media will be returned. Supported values are photos and videos.

sort string | optional
The order of items in the media collection. Supported values are: asc, desc. Default: asc

page integer | optional
The page number you are requesting. Default: 1

per_page integer | optional
The number of results you are requesting per page. Default: 15 Max: 80

Response
id string
The id of the collection you are requesting.

media array of Photo or Video objects.
An array of media objects. Each object has an extra type attribute to indicate the type of object.

page integer
The current page number.

per_page integer
The number of results returned with each page.

total_results integer
The total number of results for the request.

prev_page string | optional
URL for the previous page of results, if applicable.

next_page string | optional
URL for the next page of results, if applicable.