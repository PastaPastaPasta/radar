/**
 * Each Radar SDK method (`data/sdk/methods/*.ts`): the Platform SDK call it makes, and the pages that read it. A
 * method with no entry fails `reference.test.ts`, so a package that adds a method adds its row here.
 */
export interface MethodRow {
  /** The Evo SDK call behind the method, with its arguments. */
  call: string
  /** Route ids of `SITE_MAP` pages. */
  pages: string[]
}

export const METHOD_PAGES: Record<string, MethodRow> = {
  'addresses.get': { call: 'addresses.getWithProof(address)', pages: ['/platform-address/$addr'] },
  'addresses.getMany': {
    call: 'addresses.getManyWithProof(addresses)',
    pages: ['/platform-address/$addr'],
  },
  'contracts.fetch': {
    call: 'contracts.fetchWithProof(id)',
    pages: [
      '/contract/$id',
      '/contract/$id/documents/$type',
      '/document/$contract/$type/$id',
      '/query',
    ],
  },
  'contracts.getMany': {
    call: 'contracts.getManyWithProof(ids)',
    pages: ['/contracts', '/tokens'],
  },
  'contracts.serialized': {
    call: 'contracts.fetchWithProof(id), then DataContract.toBytes(protocolVersion)',
    pages: ['/tools/$decoder'],
  },
  'documents.average': {
    call: 'documents.averageWithProof({ dataContractId, documentTypeName, where, groupBy }, property)',
    pages: ['/query'],
  },
  'documents.count': {
    call: 'documents.countWithProof({ dataContractId, documentTypeName, where, groupBy })',
    pages: ['/query'],
  },
  'documents.get': {
    call: 'documents.getWithProof(contractId, type, id)',
    pages: ['/document/$contract/$type/$id'],
  },
  'documents.query': {
    call: 'documents.queryWithProof({ dataContractId, documentTypeName, where, orderBy, limit, startAfter })',
    pages: ['/contract/$id/documents/$type', '/query', '/names', '/mn/$protx'],
  },
  'documents.sum': {
    call: 'documents.sumWithProof({ dataContractId, documentTypeName, where, groupBy }, property)',
    pages: ['/query'],
  },
  'dpns.getUsernameByName': {
    call: 'dpns.getUsernameByNameWithProof(name)',
    pages: ['/name/$label', '/identities'],
  },
  'dpns.usernames': {
    call: 'dpns.usernamesWithProof({ identityId, limit })',
    pages: ['/identity/$id', '/names'],
  },
  'epoch.current': {
    call: 'epoch.currentWithProof()',
    pages: ['/', '/platform', '/epochs', '/mn/$protx'],
  },
  'epoch.epochsInfo': {
    call: 'epoch.epochsInfoWithProof({ start, count, ascending })',
    pages: ['/epochs', '/platform'],
  },
  'epoch.evonodesProposedBlocksByIds': {
    call: 'epoch.evonodesProposedBlocksByIdsWithProof(epoch, proTxHashes)',
    pages: ['/epoch/$n', '/mn/$protx'],
  },
  'epoch.evonodesProposedBlocksByRange': {
    call: 'epoch.evonodesProposedBlocksByRangeWithProof({ epoch, limit, startAfter })',
    pages: ['/platform', '/epoch/$n'],
  },
  'epoch.finalizedInfos': {
    call: 'epoch.finalizedInfosWithProof({ start, count })',
    pages: ['/epochs', '/epoch/$n', '/mn/$protx'],
  },
  'group.identityGroups': {
    call: 'group.identityGroupsWithProof({ identityId })',
    pages: ['/identity/$id', '/groups/$contract', '/group/$contract/$pos'],
  },
  'identities.balanceAndRevision': {
    call: 'identities.balanceAndRevisionWithProof(id)',
    pages: ['/identity/$id'],
  },
  'identities.balances': {
    call: 'identities.balancesWithProof(ids)',
    pages: ['/identities', '/mn/$protx'],
  },
  'identities.byNonUniquePublicKeyHash': {
    call: 'identities.byNonUniquePublicKeyHashWithProof(publicKeyHash, startAfter)',
    pages: ['/identity/lookup', '/identity/$id'],
  },
  'identities.byPublicKeyHash': {
    call: 'identities.byPublicKeyHashWithProof(publicKeyHash)',
    pages: ['/identity/lookup'],
  },
  'identities.contractKeys': {
    call: 'identities.contractKeysWithProof({ identityIds, contractId, purposes })',
    pages: ['/identity/$id'],
  },
  'identities.contractNonce': {
    call: 'identities.contractNonceWithProof(id, contractId)',
    pages: ['/identity/$id'],
  },
  'identities.fetch': { call: 'identities.fetchWithProof(id)', pages: ['/identity/$id'] },
  'identities.getKeys': {
    call: 'identities.getKeysWithProof({ identityId, request })',
    pages: ['/identity/$id'],
  },
  'identities.nonce': { call: 'identities.nonceWithProof(id)', pages: ['/identity/$id'] },
  'protocol.versionUpgradeState': {
    call: 'protocol.versionUpgradeStateWithProof()',
    pages: ['/protocol', '/platform'],
  },
  'protocol.versionUpgradeVoteStatus': {
    call: 'protocol.versionUpgradeVoteStatusWithProof(startProTxHash, count)',
    pages: ['/protocol', '/mn/$protx'],
  },
  'system.currentQuorumsInfo': {
    call: 'system.currentQuorumsInfo()',
    pages: ['/quorums', '/platform', '/status'],
  },
  'system.pathElements': {
    call: 'system.pathElementsWithProof(path, keys)',
    pages: ['/tools/$decoder'],
  },
  'system.status': { call: 'system.status()', pages: ['/status'] },
  'system.totalCredits': {
    call: 'system.totalCreditsInPlatformWithProof()',
    pages: ['/credits', '/platform'],
  },
  'tokens.balances': {
    call: 'tokens.balancesWithProof(identityIds, tokenId)',
    pages: ['/token/$id/holders', '/token/$id'],
  },
  'tokens.calculateId': { call: 'tokens.calculateId(contractId, position)', pages: ['/token/$id'] },
  'tokens.contractInfo': {
    call: 'tokens.contractInfoWithProof(tokenId)',
    pages: ['/token/$id', '/tokens'],
  },
  'tokens.identityBalances': {
    call: 'tokens.identityBalancesWithProof(identityId, tokenIds)',
    pages: ['/identity/$id', '/token/$id/holders'],
  },
  'tokens.identityTokenInfos': {
    call: 'tokens.identityTokenInfosWithProof(identityId, tokenIds)',
    pages: ['/identity/$id'],
  },
  'tokens.statuses': {
    call: 'tokens.statusesWithProof(tokenIds)',
    pages: ['/token/$id', '/tokens'],
  },
  'tokens.totalSupply': {
    call: 'tokens.totalSupplyWithProof(tokenId)',
    pages: ['/token/$id', '/tokens'],
  },
  'voting.contestedResourceIdentityVotes': {
    call: 'voting.contestedResourceIdentityVotesWithProof({ identityId, limit })',
    pages: ['/identity/$id', '/contests'],
  },
  'voting.votePollsByEndDate': {
    call: 'voting.votePollsByEndDateWithProof({ startTimeInfo, endTimeInfo, limit })',
    pages: ['/polls', '/contests', '/contest/$label'],
  },
}
