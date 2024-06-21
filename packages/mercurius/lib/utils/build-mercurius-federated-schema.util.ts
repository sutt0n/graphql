import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { BuildFederatedSchemaOptions, transformSchema } from '@nestjs/graphql';
import { buildASTSchema, GraphQLSchema, isObjectType } from 'graphql';

export function buildMercuriusFederatedSchema({
  typeDefs,
  resolvers,
}: BuildFederatedSchemaOptions) {
  const { buildSubgraphSchema, printSubgraphSchema } = loadPackage(
    '@apollo/subgraph',
    'MercuriusFederation',
    () => require('@apollo/subgraph'),
  );

  // @ts-ignore
  typeDefs.definitions = typeDefs.definitions.filter(
    (definition) =>
      definition?.kind !== 'DirectiveDefinition' &&
      // @ts-ignore
      definition?.name?.value !== 'tag',
  );

  let executableSchema: GraphQLSchema = buildSubgraphSchema({
    typeDefs,
    resolvers,
  });

  const subscriptionResolvers = resolvers.Subscription;
  executableSchema = transformSchema(executableSchema, (type) => {
    if (isObjectType(type)) {
      const isSubscription = type.name === 'Subscription';
      for (const [key, value] of Object.entries(type.getFields())) {
        if (isSubscription && subscriptionResolvers) {
          const resolver = subscriptionResolvers[key];
          if (resolver && !value.subscribe) {
            value.subscribe = resolver.subscribe;
          }
        } else if (key === '_service') {
          // Workaround for https://github.com/mercurius-js/mercurius/issues/273
          value.resolve = function resolve() {
            return {
              sdl: printSubgraphSchema(
                buildASTSchema(typeDefs, {
                  assumeValid: true,
                }),
              )
                .replace('type Query {', 'type Query @extends {')
                .replace('type Mutation {', 'type Mutation @extends {')
                .replace('type Subscription {', 'type Subscription @extends {'),
            };
          };
        }
      }
    }
    return type;
  });

  return executableSchema;
}
