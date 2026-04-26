import type { SheriffSettings } from '@softarc/sheriff-core';

const config: SheriffSettings = {
  tagging: {
    'src/views/<view>':         ['type:view'],
    'src/components/ui':        ['type:ui'],
    'src/components/<comp>':    ['type:component'],
    'src/hooks/<hook>':         ['type:hook'],
    'src/lib/<lib>':            ['type:lib'],
    'src/context/<ctx>':        ['type:context'],
    'src/config':               ['type:config'],
    'src/data':                 ['type:data'],
  },
  depRules: {
    'type:view':      ['type:component', 'type:ui', 'type:hook', 'type:lib', 'type:context', 'type:config', 'type:data'],
    'type:component': ['type:component', 'type:ui', 'type:hook', 'type:lib', 'type:context', 'type:config', 'type:data'],
    'type:hook':      ['type:hook', 'type:lib', 'type:context', 'type:config', 'type:data'],
    'type:context':   ['type:lib', 'type:hook', 'type:config', 'type:data'],
    'type:lib':       ['type:lib', 'type:config', 'type:data'],
    'type:ui':        ['type:lib'],
    'type:config':    [],
    'type:data':      [],
  },
};

export default config;
