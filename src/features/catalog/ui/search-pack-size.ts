// Match the weight and volume notation accepted by catalog search.
const packSize = /(?:^|\s)\d+(?:[,.]\d+)?\s*(кг|мл|г|л)(?=$|\s)/iu;

export const asksForPackSize = (query: string) => packSize.test(query);
