import axios, { AxiosError } from "axios";
import { log, fs } from "vortex-api";
import path = require("path");
import retry from "async-retry";

export interface IHttpClientOptions {
  disableCache?: true;
  customHeaders?: { [key: string]: string };
}

/**
 * A simple client base class to encapsulate retrieving data from a JSON API endpoint.
 *
 * @remarks
 * This client uses *only* unauthenticated endpoints, no auth has been implemented.
 */
export abstract class HttpClient {
  /**
   * Creates a new HttpClient with the specified user agent.
   *
   * @param retryCount (Optional) Maximum number of retries to attempt when requests fail
   */
  constructor(retryCount?: number) {
    this.retryCount = retryCount ?? 3;
  }

  /** Maximum number of retries to attempt when requests fail */
  protected retryCount: number;

  /**
   * Downloads a binary file from a remote endpoint.
   *
   * @param url The URL to download the file from.
   * @param destinationFile Output file path to write the downloaded file to.
   * @param contentType The content type to request. Defaults to 'application/zip'
   * @returns The file name of the downloaded file.
   */
  protected downloadFile = async <T>(
    url: string,
    destinationFile: string,
    contentType?: string
  ): Promise<string> => {
    var result = await axios.request({
      responseType: "arraybuffer",
      url: url,
      method: "get",
      headers: {
        "Content-Type": contentType ?? "application/zip",
      },
    });
    const outputFilename = destinationFile;
    let buffer = Buffer.from(result.data);
    fs.writeFileSync(outputFilename, buffer);
    return outputFilename;
  };

  /**
   * Helper method for retrieving data from the a JSON API.
   *
   * @remarks
   * - This method is just the common logic and needs a callback to declare what to return from the output.
   *
   * @param url - The endpoint URL for the request.
   * @param returnHandler - A callback to take the API response and return specific data.
   * @param onError - An optional callback to handle errors encountered during the request.
   * @param options - An optional object to tweak the behaviour of the HTTP request.
   * @returns The repsonse after transformation by the returnHandler. Returns null on error/not found.
   */
  protected getApiResponse = async <T>(
    url: string,
    returnHandler?: (data: any) => T,
    onError?: (err: Error) => any,
    options?: IHttpClientOptions
  ): Promise<T | null> | null => {
    returnHandler = returnHandler ?? ((data) => data);
    try {
      var resp = await retry(
        async (bail) => {
          try {
            var response = await axios.request<T>({
              url: url,
              headers: this.getHeaders(options),
            });
            const { data } = response;
            return returnHandler(data);
          } catch (err) {
            if (
              (err as AxiosError).response &&
              (err as AxiosError).response.status == 404
            ) {
              bail(err);
            } else {
              throw err;
            }
          }
        },
        {
          retries: this.retryCount ?? 3,
          onRetry: (err) => {
            log("debug", "error during HTTP request, retrying", { err });
          },
        }
      );
      return resp;
    } catch (err) {
      if (onError) {
        return onError?.(err);
      } else {
        throw err;
      }
    }
  };

  private getHeaders(options?: IHttpClientOptions) {
    var headers: { [key: string]: string } = {};
    if (options?.disableCache === true) {
      headers["pragma"] = "no-cache";
      headers["cache-control"] = "no-cache";
    }
    if (
      options?.customHeaders &&
      Object.keys(options.customHeaders).length > 0
    ) {
      for (const headerKey of Object.keys(options.customHeaders)) {
        headers[headerKey] = options.customHeaders[headerKey];
      }
    }
    return headers;
  }

  protected getType(fileName: string) {
    return path.extname(fileName).replace(".", "");
  }
}
