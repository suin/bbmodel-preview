export type Vec3 = readonly [number, number, number];

export type BbmodelFaceName =
  | "north"
  | "east"
  | "south"
  | "west"
  | "up"
  | "down";

export type BbmodelFace = {
  readonly uv?: readonly [number, number, number, number];
  readonly texture?: number | string;
};

export type BbmodelElement = {
  readonly uuid: string;
  readonly name?: string;
  readonly type?: string;
  readonly from?: Vec3;
  readonly to?: Vec3;
  readonly origin?: Vec3;
  readonly rotation?: Vec3;
  readonly faces?: Partial<Record<BbmodelFaceName, BbmodelFace>>;
  readonly visibility?: boolean;
};

export type BbmodelTexture = {
  readonly id?: string;
  readonly name?: string;
  readonly path?: string;
  readonly source?: string;
  readonly width?: number;
  readonly height?: number;
  readonly uv_width?: number;
  readonly uv_height?: number;
};

export type BbmodelFile = {
  readonly name?: string;
  readonly model_identifier?: string;
  readonly resolution?: { readonly width?: number; readonly height?: number };
  readonly elements?: ReadonlyArray<BbmodelElement>;
  readonly textures?: ReadonlyArray<BbmodelTexture>;
};
