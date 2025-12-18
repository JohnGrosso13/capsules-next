-- Ensure the service_role can read from the analytics schema
-- used by the /admin overview page.

grant usage on schema analytics to service_role;
grant select on all tables in schema analytics to service_role;
grant select on all sequences in schema analytics to service_role;
grant select on analytics.overview to service_role;
