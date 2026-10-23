CREATE TABLE "traffic_buckets" (
	"day" date NOT NULL,
	"dimension" text NOT NULL,
	"value" text NOT NULL,
	"pageviews" bigint DEFAULT 0 NOT NULL,
	"visitors" "bytea",
	"visits" "bytea",
	CONSTRAINT "traffic_buckets_day_dimension_value_pk" PRIMARY KEY("day","dimension","value"),
	CONSTRAINT "traffic_dimension_ck" CHECK ("traffic_buckets"."dimension" in ('total', 'path', 'referrer', 'country', 'device', 'browser', 'os')),
	CONSTRAINT "traffic_value_ck" CHECK (length("traffic_buckets"."value") <= 300),
	CONSTRAINT "traffic_pageviews_ck" CHECK ("traffic_buckets"."pageviews" >= 0),
	CONSTRAINT "traffic_sketch_ck" CHECK (("traffic_buckets"."dimension" = 'total' and octet_length("traffic_buckets"."visitors") = 4096 and octet_length("traffic_buckets"."visits") = 4096 and "traffic_buckets"."visitors" is not null and "traffic_buckets"."visits" is not null) or ("traffic_buckets"."dimension" <> 'total' and "traffic_buckets"."visitors" is null and "traffic_buckets"."visits" is null))
);
